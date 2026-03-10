"""
Scheduler Service for managing scheduled crawl jobs.

Uses APScheduler with AsyncIO for scheduling periodic crawls.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.jobstores.base import JobLookupError
from loguru import logger


class SchedulerService:
    """Service for managing scheduled crawl jobs."""
    
    _instance: Optional['SchedulerService'] = None
    _initialized: bool = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if SchedulerService._initialized:
            return
        
        self.scheduler = AsyncIOScheduler(
            timezone='UTC',
            job_defaults={
                'coalesce': True,
                'max_instances': 1,
                'misfire_grace_time': 3600
            }
        )
        self._db = None
        self._crawl_function = None
        SchedulerService._initialized = True
    
    def set_dependencies(self, db, crawl_function):
        """Set database and crawl function dependencies."""
        self._db = db
        self._crawl_function = crawl_function
    
    async def start(self):
        """Start the scheduler and load existing schedules."""
        if self.scheduler.running:
            logger.info("Scheduler already running")
            return
        
        try:
            self.scheduler.start()
            logger.info("Scheduler started")
            
            if self._db:
                await self._load_all_schedules()
        except Exception as e:
            logger.error(f"Failed to start scheduler: {e}")
            raise
    
    def shutdown(self):
        """Gracefully shutdown the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("Scheduler shutdown complete")
    
    async def _load_all_schedules(self):
        """Load all site schedules from database on startup."""
        try:
            sites = await self._db.get_sites_with_schedules()
            loaded_count = 0
            
            for site in sites:
                site_id = site.get("site_id")
                schedule_config = site.get("crawl_schedule", {})
                
                if schedule_config.get("enabled"):
                    await self.add_crawl_schedule(site_id, schedule_config, site.get("url"))
                    loaded_count += 1
            
            logger.info(f"Loaded {loaded_count} crawl schedules")
        except Exception as e:
            logger.error(f"Failed to load schedules: {e}")
    
    async def add_crawl_schedule(
        self,
        site_id: str,
        schedule_config: Dict[str, Any],
        site_url: str
    ) -> Optional[datetime]:
        """
        Add or update a crawl schedule for a site.
        
        Returns the next scheduled run time.
        """
        job_id = f"crawl_{site_id}"
        
        self.remove_crawl_schedule(site_id)
        
        if not schedule_config.get("enabled", False):
            return None
        
        frequency = schedule_config.get("frequency", "weekly")
        custom_cron = schedule_config.get("custom_cron")
        
        trigger = self._get_trigger(frequency, custom_cron)
        if not trigger:
            logger.warning(f"Invalid schedule frequency for site {site_id}: {frequency}")
            return None
        
        max_pages = schedule_config.get("max_pages", 50)
        include_patterns = schedule_config.get("include_patterns", [])
        exclude_patterns = schedule_config.get("exclude_patterns", [])
        
        job = self.scheduler.add_job(
            self._execute_scheduled_crawl,
            trigger=trigger,
            id=job_id,
            name=f"Scheduled crawl for {site_id}",
            kwargs={
                "site_id": site_id,
                "site_url": site_url,
                "max_pages": max_pages,
                "include_patterns": include_patterns,
                "exclude_patterns": exclude_patterns
            },
            replace_existing=True
        )
        
        next_run = job.next_run_time
        logger.info(f"Added crawl schedule for site {site_id}, next run: {next_run}")
        
        if self._db:
            await self._db.update_crawl_schedule(site_id, {"next_crawl_at": next_run})
        
        return next_run
    
    def remove_crawl_schedule(self, site_id: str) -> bool:
        """Remove a crawl schedule for a site."""
        job_id = f"crawl_{site_id}"
        
        try:
            self.scheduler.remove_job(job_id)
            logger.info(f"Removed crawl schedule for site {site_id}")
            return True
        except JobLookupError:
            return False
    
    def get_next_run(self, site_id: str) -> Optional[datetime]:
        """Get the next scheduled run time for a site."""
        job_id = f"crawl_{site_id}"
        job = self.scheduler.get_job(job_id)
        
        if job:
            return job.next_run_time
        return None
    
    def get_all_jobs(self) -> List[Dict[str, Any]]:
        """Get all scheduled jobs."""
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time,
                "pending": job.pending
            })
        return jobs
    
    async def trigger_immediate_crawl(
        self,
        site_id: str,
        site_url: str,
        max_pages: int = 50,
        include_patterns: List[str] = None,
        exclude_patterns: List[str] = None
    ) -> str:
        """Trigger an immediate crawl for a site. Returns job_id."""
        if not self._crawl_function:
            raise RuntimeError("Crawl function not configured")
        
        logger.info(f"Triggering immediate crawl for site {site_id}")
        
        job_id = await self._crawl_function(
            site_url=site_url,
            site_id=site_id,
            max_pages=max_pages,
            include_patterns=include_patterns or [],
            exclude_patterns=exclude_patterns or [],
            trigger="manual"
        )
        
        return job_id
    
    async def _execute_scheduled_crawl(
        self,
        site_id: str,
        site_url: str,
        max_pages: int,
        include_patterns: List[str],
        exclude_patterns: List[str]
    ):
        """Execute a scheduled crawl job."""
        if not self._crawl_function:
            logger.error("Crawl function not configured")
            return
        
        logger.info(f"Executing scheduled crawl for site {site_id}")
        
        try:
            running_job = await self._db.get_running_crawl_job(site_id)
            if running_job:
                logger.warning(f"Crawl already running for site {site_id}, skipping")
                return
            
            job_id = await self._crawl_function(
                site_url=site_url,
                site_id=site_id,
                max_pages=max_pages,
                include_patterns=include_patterns,
                exclude_patterns=exclude_patterns,
                trigger="scheduled"
            )
            
            if self._db:
                await self._db.update_crawl_schedule(
                    site_id,
                    {
                        "last_crawl_at": datetime.utcnow(),
                        "next_crawl_at": self.get_next_run(site_id)
                    }
                )
            
            logger.info(f"Scheduled crawl started for site {site_id}, job_id: {job_id}")
            
        except Exception as e:
            logger.error(f"Failed to execute scheduled crawl for site {site_id}: {e}")
    
    def _get_trigger(self, frequency: str, custom_cron: Optional[str] = None):
        """Get APScheduler trigger based on frequency."""
        if frequency == "custom" and custom_cron:
            try:
                return CronTrigger.from_crontab(custom_cron)
            except Exception as e:
                logger.error(f"Invalid cron expression: {custom_cron}, error: {e}")
                return None
        
        frequency_map = {
            "daily": CronTrigger(hour=2, minute=0),
            "weekly": CronTrigger(day_of_week=0, hour=2, minute=0),
            "monthly": CronTrigger(day=1, hour=2, minute=0),
        }
        
        return frequency_map.get(frequency)
    
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self.scheduler.running


scheduler_service = SchedulerService()


def get_scheduler() -> SchedulerService:
    """Get the scheduler service instance."""
    return scheduler_service
