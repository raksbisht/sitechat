"""
RAG Engine with all best practices:
- Hybrid search (semantic + keyword)
- Query rewriting
- Document grading
- Conversation memory
- Structured output
- Source citations
- Q&A pair matching for trained responses
"""
import asyncio
import re
from typing import List, Dict, Optional, Tuple, AsyncGenerator
from datetime import datetime
from langchain_core.documents import Document
from loguru import logger
import numpy as np

from app.config import settings
from app.database import get_mongodb, get_vector_store
from app.services.ollama import get_ollama_service
from app.models.schemas import ChatResponse, SourceDocument


def _truncate_text(text: str, max_chars: int) -> str:
    if max_chars <= 0 or not text or len(text) <= max_chars:
        return text or ""
    return text[: max_chars - 1].rstrip() + "…"


class RAGEngine:
    """RAG Engine with production-ready features."""
    
    QA_MATCH_THRESHOLD = 0.85  # Confidence threshold for using Q&A pair directly
    
    def __init__(self):
        self.ollama = get_ollama_service()
        self.vector_store = get_vector_store()
        self._qa_cache: Dict[str, List[Dict]] = {}  # Cache Q&A pairs by site_id
        self._qa_embeddings_cache: Dict[str, List[Tuple[str, List[float]]]] = {}  # Cache Q&A embeddings
    
    async def _check_qa_match(
        self,
        query: str,
        site_id: str
    ) -> Optional[Tuple[Dict, float]]:
        """
        Check if there's a matching Q&A pair for the query.
        Returns the best matching Q&A pair and its similarity score if above threshold.
        """
        if not site_id:
            return None
        
        mongodb = await get_mongodb()
        
        # Get Q&A pairs (use cache if available)
        if site_id not in self._qa_cache:
            qa_pairs = await mongodb.get_qa_for_rag(site_id)
            self._qa_cache[site_id] = qa_pairs
            # Clear embeddings cache when Q&A pairs change
            self._qa_embeddings_cache.pop(site_id, None)
        
        qa_pairs = self._qa_cache.get(site_id, [])
        
        if not qa_pairs:
            return None
        
        try:
            # Get embeddings for Q&A questions if not cached
            if site_id not in self._qa_embeddings_cache:
                embeddings_model = self.vector_store.embeddings
                qa_embeddings = []
                
                for qa in qa_pairs:
                    question = qa.get("question", "")
                    embedding = embeddings_model.embed_query(question)
                    qa_embeddings.append((qa["id"], embedding))
                
                self._qa_embeddings_cache[site_id] = qa_embeddings
            
            qa_embeddings = self._qa_embeddings_cache.get(site_id, [])
            
            if not qa_embeddings:
                return None
            
            # Get query embedding
            embeddings_model = self.vector_store.embeddings
            query_embedding = embeddings_model.embed_query(query)
            query_embedding = np.array(query_embedding)
            
            # Find best matching Q&A pair using cosine similarity
            best_match = None
            best_score = 0.0
            
            for qa_id, qa_emb in qa_embeddings:
                qa_emb_array = np.array(qa_emb)
                
                # Cosine similarity
                dot_product = np.dot(query_embedding, qa_emb_array)
                norm_product = np.linalg.norm(query_embedding) * np.linalg.norm(qa_emb_array)
                
                if norm_product > 0:
                    similarity = dot_product / norm_product
                else:
                    similarity = 0.0
                
                if similarity > best_score:
                    best_score = similarity
                    best_match = next((qa for qa in qa_pairs if qa["id"] == qa_id), None)
            
            if best_match and best_score >= self.QA_MATCH_THRESHOLD:
                logger.info(f"Q&A match found: '{best_match['question'][:50]}...' with score {best_score:.3f}")
                return best_match, best_score
            
            return None
            
        except Exception as e:
            logger.warning(f"Q&A matching error: {e}")
            return None
    
    def invalidate_qa_cache(self, site_id: str = None):
        """Invalidate Q&A cache for a site or all sites."""
        if site_id:
            self._qa_cache.pop(site_id, None)
            self._qa_embeddings_cache.pop(site_id, None)
        else:
            self._qa_cache.clear()
            self._qa_embeddings_cache.clear()
    
    async def chat(
        self,
        message: str,
        session_id: str,
        user_id: str = None,
        site_id: str = None,
        stream: bool = False
    ) -> ChatResponse:
        """
        Process a chat message and generate a response.
        
        Args:
            message: User's message
            session_id: Conversation session ID
            user_id: Optional user ID for long-term memory
            site_id: Optional site ID to filter documents
            stream: Whether to stream the response
        
        Returns:
            ChatResponse with answer, sources, and suggestions
        """
        mongodb = await get_mongodb()
        
        # Get site URL filter and name if site_id provided
        site_url_filter = None
        site_name = None
        if site_id:
            site = await mongodb.db.sites.find_one({"site_id": site_id})
            if site:
                site_url_filter = site.get("url", "").rstrip("/")
                site_name = site.get("name") or site_url_filter.replace("https://", "").replace("http://", "")
                logger.info(f"Filtering by site: {site_url_filter}")
        
        try:
            # 1–3. Overlap I/O: history + Q&A match, and optionally vector retrieval (speculative prefetch).
            rewritten_query = message
            prefetch = getattr(settings, "CHAT_SPECULATIVE_PREFETCH", True)

            if prefetch:
                history, qa_match, retrieved_docs = await asyncio.gather(
                    mongodb.get_conversation_history(session_id),
                    self._check_qa_match(rewritten_query, site_id),
                    self._retrieve_documents(rewritten_query, site_url_filter=site_url_filter),
                )
            else:
                history, qa_match = await asyncio.gather(
                    mongodb.get_conversation_history(session_id),
                    self._check_qa_match(rewritten_query, site_id),
                )
                retrieved_docs = None

            if qa_match:
                qa_pair, qa_score = qa_match
                logger.info(f"Using Q&A pair response (score: {qa_score:.3f})")
                
                # Use Q&A pair directly
                answer = qa_pair["answer"]
                sources = [SourceDocument(
                    url=f"qa://{qa_pair['id']}",
                    title="Trained Q&A Response",
                    content_preview=qa_pair["question"][:200],
                    relevance_score=qa_score
                )]
                confidence = min(0.98, qa_score + 0.05)
                
                # Increment Q&A use count
                await mongodb.increment_qa_use_count(qa_pair["id"])
                
                # Follow-up suggestions are disabled to avoid an extra LLM call.
                follow_ups = []
                
                # Save messages to history
                await mongodb.save_message(
                    session_id=session_id,
                    role="user",
                    content=message,
                    site_id=site_id
                )
                await mongodb.save_message(
                    session_id=session_id,
                    role="assistant",
                    content=answer,
                    sources=[s.dict() for s in sources],
                    site_id=site_id
                )
                
                return ChatResponse(
                    answer=answer,
                    sources=sources,
                    confidence=confidence,
                    follow_up_questions=follow_ups,
                    session_id=session_id
                )
            
            # 4. No Q&A match - use prefetched retrieval or fetch now
            if retrieved_docs is None:
                retrieved_docs = await self._retrieve_documents(rewritten_query, site_url_filter=site_url_filter)
            
            # 5. Grade documents for relevance
            relevant_docs = await self._grade_documents(rewritten_query, retrieved_docs)
            
            # 6. Build context from relevant docs
            context, sources = self._build_context(relevant_docs)
            
            # 7. Generate response
            answer = await self._generate_response(
                question=message,
                context=context,
                history=history,
                user_id=user_id,
                site_name=site_name
            )
            
            # 8. Follow-up suggestions are disabled to avoid an extra LLM call.
            follow_ups = []
            
            # 9. Calculate confidence
            confidence = self._calculate_confidence(relevant_docs)
            
            # 10. Save messages to history
            await mongodb.save_message(
                session_id=session_id,
                role="user",
                content=message,
                site_id=site_id
            )
            await mongodb.save_message(
                session_id=session_id,
                role="assistant",
                content=answer,
                sources=[s.dict() for s in sources],
                site_id=site_id
            )
            
            return ChatResponse(
                answer=answer,
                sources=sources,
                confidence=confidence,
                follow_up_questions=follow_ups,
                session_id=session_id
            )
            
        except Exception as e:
            logger.error(f"RAG engine error: {e}")
            raise
    
    async def chat_stream(
        self,
        message: str,
        session_id: str,
        user_id: str = None,
        site_id: str = None,
    ) -> AsyncGenerator[str, None]:
        """Stream a chat response (history + retrieval run in parallel)."""
        mongodb = await get_mongodb()

        site_url_filter = None
        site_name = None
        if site_id:
            site = await mongodb.db.sites.find_one({"site_id": site_id})
            if site:
                site_url_filter = site.get("url", "").rstrip("/")
                site_name = site.get("name") or site_url_filter.replace("https://", "").replace("http://", "")

        try:
            rewritten_query = message
            history, retrieved_docs = await asyncio.gather(
                mongodb.get_conversation_history(session_id),
                self._retrieve_documents(rewritten_query, site_url_filter=site_url_filter),
            )
            relevant_docs = await self._grade_documents(rewritten_query, retrieved_docs)
            context, sources = self._build_context(relevant_docs)

            prompt = self._build_prompt(message, context, history)
            system_prompt = self._get_system_prompt(site_name)

            full_response = ""
            async for chunk in self.ollama.generate_stream(
                prompt,
                system_prompt,
                temperature=settings.LLM_TEMPERATURE,
                max_tokens=settings.LLM_MAX_TOKENS,
            ):
                full_response += chunk
                yield chunk

            await mongodb.save_message(
                session_id, "user", message, site_id=site_id
            )
            await mongodb.save_message(
                session_id,
                "assistant",
                full_response,
                sources=[s.dict() for s in sources],
                site_id=site_id,
            )
            
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"\n\nError: {str(e)}"
    
    async def _rewrite_query(
        self,
        query: str,
        history: List[Dict]
    ) -> str:
        """Rewrite query with conversation context."""
        if not history:
            return query
        
        # Format history
        history_text = "\n".join([
            f"{m['role'].title()}: {m['content'][:200]}"
            for m in history[-4:]  # Last 4 messages
        ])
        
        prompt = f"""Given the conversation history and the user's new question, rewrite the question to be a standalone search query that captures the full context.

Conversation history:
{history_text}

New question: {query}

Rewritten search query (just the query, no explanation):"""
        
        try:
            rewritten = await self.ollama.generate(
                prompt,
                temperature=0.3,
                max_tokens=150
            )
            return rewritten.strip() or query
        except Exception as e:
            logger.warning(f"Query rewriting failed: {e}")
            return query
    
    async def _retrieve_documents(
        self,
        query: str,
        k: int = None,
        site_url_filter: str = None
    ) -> List[Tuple[Document, float]]:
        """Retrieve relevant documents using hybrid search (runs in a thread pool so it can overlap I/O)."""
        k_val = k or settings.RETRIEVAL_K
        oversample = max(1, getattr(settings, "RAG_RETRIEVAL_OVERSAMPLE", 2))
        vs = self.vector_store
        sf = site_url_filter

        def _sync_retrieve() -> List[Tuple[Document, float]]:
            results = vs.similarity_search_with_score(query, k=k_val * oversample)
            if sf:
                filtered_results = []
                for doc, score in results:
                    doc_url = doc.metadata.get("url", "") or doc.metadata.get("source", "")
                    if doc_url.startswith(sf):
                        filtered_results.append((doc, score))
                results = filtered_results
                logger.info(f"Filtered to {len(results)} docs for site: {sf}")
            results.sort(key=lambda x: x[1])
            return results[:k_val]

        return await asyncio.to_thread(_sync_retrieve)
    
    async def _grade_documents(
        self,
        query: str,
        docs: List[Tuple[Document, float]]
    ) -> List[Tuple[Document, float]]:
        """Grade documents for relevance."""
        if not docs:
            return []
        
        graded = []
        
        for doc, score in docs:
            # Simple relevance check based on score threshold
            # Lower score = more relevant for Chroma
            if score < 1.5:  # Threshold
                graded.append((doc, score))
            else:
                # Check if any query terms appear in document
                query_terms = set(query.lower().split())
                doc_text = doc.page_content.lower()
                
                overlap = sum(1 for term in query_terms if term in doc_text)
                if overlap >= len(query_terms) * 0.3:  # 30% overlap
                    graded.append((doc, score))
        
        return graded
    
    def _build_context(
        self,
        docs: List[Tuple[Document, float]]
    ) -> Tuple[str, List[SourceDocument]]:
        """Build context string and source list from documents."""
        if not docs:
            return "", []
        
        context_parts = []
        sources = []
        seen_urls = set()
        
        chunk_limit = getattr(settings, "RAG_CONTEXT_CHUNK_MAX_CHARS", 900)
        for doc, score in docs:
            body = _truncate_text(doc.page_content, chunk_limit)
            # Add to context
            context_parts.append(f"[Source: {doc.metadata.get('title', 'Unknown')}]\n{body}")
            
            # Add to sources (deduplicate by URL)
            url = doc.metadata.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                sources.append(SourceDocument(
                    url=url,
                    title=doc.metadata.get("title", "Unknown"),
                    content_preview=doc.page_content[:200] + "...",
                    relevance_score=max(0, min(1, 1 - score / 2))  # Normalize score
                ))
        
        context = "\n\n---\n\n".join(context_parts)
        return context, sources
    
    def _get_system_prompt(self, site_name: str = None) -> str:
        """Get the system prompt for the chatbot (kept compact for lower latency)."""
        site_desc = site_name if site_name else "this website"
        return (
            f"You are a helpful assistant for {site_desc}. "
            "Answer in plain language; default to a short reply (a few sentences) unless the user asks for steps, a list, or depth. "
            "Never say phrases like \"based on the context\" or \"according to the provided information\". "
            "If you lack information, say you're not sure. Use short paragraphs; bullets for lists."
        )
    
    def _build_prompt(
        self,
        question: str,
        context: str,
        history: List[Dict]
    ) -> str:
        """Build the full prompt with context and history."""
        # Format history
        history_text = ""
        if history:
            hmax = getattr(settings, "CHAT_HISTORY_MAX_MESSAGES", 4)
            cmax = getattr(settings, "CHAT_HISTORY_MESSAGE_MAX_CHARS", 350)
            history_text = "\n".join([
                f"{m['role'].title()}: {_truncate_text(m.get('content', '') or '', cmax)}"
                for m in history[-hmax:]
            ])
            history_text = f"Previous conversation:\n{history_text}\n\n"
        
        prompt = f"""{history_text}[Reference Information]
{context if context else "No specific information available."}

[User's Question]
{question}

[Instructions]
Answer the user's question naturally and conversationally. Be brief by default; expand only if the question requires it. Do NOT mention "context", "provided information", or "knowledge base" in your response. Just answer as if you naturally know about this website."""
        
        return prompt
    
    async def _generate_response(
        self,
        question: str,
        context: str,
        history: List[Dict],
        user_id: str = None,
        site_name: str = None
    ) -> str:
        """Generate the response using the LLM."""
        prompt = self._build_prompt(question, context, history)
        system_prompt = self._get_system_prompt(site_name)
        
        # Add user-specific context if available
        if user_id:
            mongodb = await get_mongodb()
            user_memory = await mongodb.get_user_memory(user_id)
            if user_memory:
                system_prompt += f"\n\nUser preferences: {user_memory}"
        
        response = await self.ollama.generate(
            prompt,
            system_prompt,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
        )
        return response.strip()
    
    async def _generate_follow_ups(
        self,
        question: str,
        answer: str
    ) -> List[str]:
        """Generate follow-up question suggestions."""
        prompt = f"""Based on this Q&A, suggest 2-3 natural follow-up questions the user might ask.

Question: {question}
Answer: {answer[:500]}

Return only the questions, one per line, no numbering:"""
        
        try:
            response = await self.ollama.generate(
                prompt,
                temperature=0.7,
                max_tokens=200
            )
            
            # Parse questions
            lines = response.strip().split("\n")
            questions = [
                line.strip().strip("-").strip("•").strip()
                for line in lines
                if line.strip() and "?" in line
            ][:3]
            
            return questions
        except Exception as e:
            logger.warning(f"Follow-up generation failed: {e}")
            return []
    
    def _calculate_confidence(
        self,
        docs: List[Tuple[Document, float]]
    ) -> float:
        """Calculate confidence score based on document relevance."""
        if not docs:
            return 0.3  # Low confidence with no sources
        
        # Average normalized scores
        scores = [max(0, min(1, 1 - score / 2)) for _, score in docs]
        avg_score = sum(scores) / len(scores)
        
        # Boost confidence if we have multiple sources
        source_bonus = min(0.2, len(docs) * 0.05)
        
        return min(0.95, avg_score + source_bonus)


# Singleton instance
_rag_engine: Optional[RAGEngine] = None


def get_rag_engine() -> RAGEngine:
    """Get or create RAGEngine instance."""
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = RAGEngine()
    return _rag_engine
