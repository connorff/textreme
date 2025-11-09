#!/usr/bin/env python3
"""
Memory Pipeline - Create memory summaries for contacts from iMessage chat.db

This pipeline:
1. Finds top 20 conversations from last 6 months ordered by # of messages
2. Chunks messages by week and generates monthly highlights
3. Stores context of last 6 months per contact
4. Extracts important moments, milestones, and relationship insights
"""

import sqlite3
import os
import re
import time
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, asdict
import json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

load_dotenv()

try:
    from tqdm import tqdm
except ImportError:
    # Fallback if tqdm not installed
    class tqdm:
        def __init__(self, iterable=None, total=None, desc=None, **kwargs):
            self.iterable = iterable
            self.total = total
            self.desc = desc
            self.n = 0
        
        def __iter__(self):
            return iter(self.iterable)
        
        def __enter__(self):
            return self
        
        def __exit__(self, *args):
            pass
        
        def update(self, n=1):
            self.n += n
        
        def set_description(self, desc):
            self.desc = desc
        
        def close(self):
            pass

try:
    from openai import OpenAI, RateLimitError
except ImportError:
    print("OpenAI package not installed. Run: pip install openai")
    OpenAI = None
    RateLimitError = None


class OpenAIKeyManager:
    """Manages multiple OpenAI API keys with automatic failover on rate limits"""
    
    def __init__(self, api_keys: List[str]):
        if not api_keys:
            raise ValueError("At least one API key is required")
        
        self.api_keys = api_keys
        self.clients = [OpenAI(api_key=key) for key in api_keys]
        self.current_index = 0
        self.cooldown_until = [0.0] * len(api_keys)  # Timestamp when each key is available again
        self.lock = threading.Lock()
        self.cooldown_duration = 60  # Cooldown period in seconds
        
        print(f"🔑 Initialized with {len(api_keys)} OpenAI API key(s)")
    
    def get_client(self) -> OpenAI:
        """Get an available OpenAI client, switching if current is on cooldown"""
        with self.lock:
            current_time = time.time()
            
            # Find first available key (not in cooldown)
            for _ in range(len(self.api_keys)):
                if current_time >= self.cooldown_until[self.current_index]:
                    return self.clients[self.current_index]
                
                # Current key is in cooldown, try next
                self.current_index = (self.current_index + 1) % len(self.api_keys)
            
            # All keys in cooldown, use the one with shortest remaining cooldown
            min_cooldown_idx = min(range(len(self.cooldown_until)), key=lambda i: self.cooldown_until[i])
            wait_time = self.cooldown_until[min_cooldown_idx] - current_time
            
            if wait_time > 0:
                print(f"⏳ All API keys in cooldown. Waiting {wait_time:.1f}s...")
                time.sleep(wait_time)
            
            self.current_index = min_cooldown_idx
            return self.clients[self.current_index]
    
    def mark_rate_limited(self):
        """Mark current key as rate limited and switch to next"""
        with self.lock:
            key_num = self.current_index + 1
            print(f"⚠️  API Key #{key_num} rate limited. Cooling down for {self.cooldown_duration}s...")
            
            self.cooldown_until[self.current_index] = time.time() + self.cooldown_duration
            
            # Switch to next key
            old_index = self.current_index
            self.current_index = (self.current_index + 1) % len(self.api_keys)
            
            if len(self.api_keys) > 1:
                print(f"🔄 Switched from Key #{old_index + 1} to Key #{self.current_index + 1}")
    
    def call_with_retry(self, func, *args, max_retries: int = 3, **kwargs):
        """Call OpenAI API with automatic key switching on rate limits"""
        for attempt in range(max_retries):
            try:
                client = self.get_client()
                # Replace 'self.client' with the current client in kwargs
                return func(client, *args, **kwargs)
            except Exception as e:
                error_str = str(e).lower()
                if 'rate' in error_str and 'limit' in error_str:
                    self.mark_rate_limited()
                    if attempt < max_retries - 1:
                        continue
                raise
        
        raise Exception(f"Failed after {max_retries} retries")


@dataclass
class Message:
    """Represents a single message"""
    text: str
    is_from_me: bool
    timestamp: datetime
    handle_id: str


@dataclass
class TextingStyleProfile:
    """Statistical metrics about how a contact texts"""
    # Message length stats
    avg_message_length: float
    median_message_length: float
    max_message_length: int
    min_message_length: int
    
    # Word count stats
    avg_words_per_message: float
    median_words_per_message: float
    
    # Emoji stats
    emoji_frequency: float  # Emojis per message
    top_emojis: List[str]  # Most frequently used emojis (top 5)
    
    # Response timing
    avg_response_time_minutes: Optional[float]
    median_response_time_minutes: Optional[float]
    
    # Conversation patterns
    messages_per_conversation: float  # Average messages they send per conversation
    
    # Activity patterns
    most_active_hours: List[int]  # Top 3 hours of day (0-23) when most active
    typical_days_active: List[str]  # Days of week with above-average activity


@dataclass
class ContactMemory:
    """Memory structure for a contact"""
    contact_id: str
    contact_name: str
    phone_number: Optional[str]
    total_messages: int
    texting_style: TextingStyleProfile
    specific_moments: List[Dict[str, Any]]  # Concrete facts: names, companies, outcomes, connections
    week_summaries: List[Dict[str, Any]]
    month_highlights: List[Dict[str, Any]]
    important_moments: List[str]  # Legacy field from AI analysis
    milestones: List[str]  # Legacy field from AI analysis
    relationship_type: str
    relationship_description: str
    last_updated: str


class ChatDatabase:
    """Interface to iMessage chat.db"""
    
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            # Default macOS iMessage database location
            db_path = os.path.expanduser("~/Library/Messages/chat.db")
        
        self.db_path = db_path
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Chat database not found at {db_path}")
    
    def get_top_contacts(self, limit: int = 20, months: int = 6) -> List[Dict[str, Any]]:
        """Get top contacts by message count in the last N months"""
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        # iMessage stores dates as nanoseconds since 2001-01-01
        cutoff_timestamp = int((cutoff_date - datetime(2001, 1, 1)).total_seconds() * 1e9)
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Use chat_message_join to properly link messages to chats and handles
        # Filter for 1:1 chats only (style = 45) to exclude group chats
        query = """
        SELECT 
            h.id as handle_id,
            h.id as phone_number,
            COUNT(m.ROWID) as message_count
        FROM message m
        INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        INNER JOIN chat c ON cmj.chat_id = c.ROWID
        INNER JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
        INNER JOIN handle h ON chj.handle_id = h.ROWID
        WHERE m.date > ?
            AND m.item_type = 0
            AND c.style = 45
        GROUP BY h.id
        ORDER BY message_count DESC
        LIMIT ?
        """
        
        cursor.execute(query, (cutoff_timestamp, limit))
        results = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        return results
    
    def get_messages_for_contact(self, handle_id: str, months: int = 6) -> List[Message]:
        """Get all messages for a specific contact in the last N months (1:1 chats only)"""
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        cutoff_timestamp = int((cutoff_date - datetime(2001, 1, 1)).total_seconds() * 1e9)
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Fetch both text and attributedBody to handle rich text messages
        # Filter for 1:1 chats only (exclude group chats)
        # In iMessage: style 45 = one-on-one, style 43 = group chat
        query = """
        SELECT 
            m.text,
            m.attributedBody,
            m.is_from_me,
            m.date,
            h.id as handle_id
        FROM message m
        INNER JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        INNER JOIN chat c ON cmj.chat_id = c.ROWID
        INNER JOIN handle h ON m.handle_id = h.ROWID
        WHERE h.id = ? 
            AND m.date > ? 
            AND m.item_type = 0                     -- Only regular messages (not group events, etc.)
            AND m.cache_has_attachments = 0         -- No attachments (photos, videos, audio)
            AND m.is_finished = 1                   -- Only completed messages
            AND m.is_system_message = 0             -- No system messages (location sharing, etc.)
            AND m.associated_message_guid IS NULL   -- No reactions/tapbacks
            AND c.style = 45                        -- Only one-on-one chats (exclude group chats)
        ORDER BY m.date ASC
        """
        
        cursor.execute(query, (handle_id, cutoff_timestamp))
        rows = cursor.fetchall()
        
        messages = []
        for row in rows:
            # Extract text from either text field or attributedBody
            message_text = self._extract_message_text(row['text'], row['attributedBody'])
            
            # Apply multiple content filters
            if (message_text 
                and not self._contains_url(message_text)
                and not self._is_low_value_message(message_text)):
                # Convert iMessage timestamp to datetime
                timestamp = datetime(2001, 1, 1) + timedelta(seconds=row['date'] / 1e9)
                messages.append(Message(
                    text=message_text,
                    is_from_me=bool(row['is_from_me']),
                    timestamp=timestamp,
                    handle_id=row['handle_id']
                ))
        
        conn.close()
        return messages
    
    def _is_low_value_message(self, text: str) -> bool:
        """
        Check if message is low-value and should be excluded from summaries.
        Examples: "k", "ok", "lol", single emoji, etc.
        """
        if not text:
            return True
        
        text_stripped = text.strip()
        text_lower = text_stripped.lower()
        
        # Too short to be meaningful (1-2 characters)
        if len(text_stripped) <= 2:
            return True
        
        # Common low-value responses
        low_value_words = {
            'k', 'ok', 'okay', 'kk', 'kkk',
            'lol', 'lmao', 'haha', 'hahaha', 
            'yea', 'yeah', 'yep', 'nah', 'nope',
            'cool', 'nice', 'wow', 'omg',
            'ty', 'thx', 'thanks', 'np',
            '👍', '👌', '😂', '😭', '🙏', '❤️', '💀'
        }
        
        if text_lower in low_value_words:
            return True
        
        # Only emojis or special characters (no letters/numbers)
        if not re.search(r'[a-zA-Z0-9]', text):
            return True
        
        # Just numbers
        if re.match(r'^[\d\s\-\+\(\)]+$', text_stripped):
            return True
        
        # Multiple repetitions of same character (e.g., "!!!!!!", "??????")
        if re.match(r'^(.)\1{3,}$', text_stripped):
            return True
        
        return False
    
    def _contains_url(self, text: str) -> bool:
        """Check if text contains a URL"""
        if not text:
            return False
        
        # Common URL patterns
        url_patterns = [
            r'https?://',           # http:// or https://
            r'www\.',               # www.
            r'\.[a-z]{2,}/',        # .com/ .org/ etc
            r'\.[a-z]{2,}\s',       # .com .org etc with space
            r'\.[a-z]{2,}$',        # .com .org etc at end
        ]
        
        text_lower = text.lower()
        for pattern in url_patterns:
            if re.search(pattern, text_lower):
                return True
        
        return False
    
    def _is_binary_artifact(self, text: str) -> bool:
        """Check if text chunk looks like binary metadata/artifacts"""
        if not text:
            return True
        
        lower = text.lower()
        
        # Filter out NSObject-related patterns
        artifacts = [
            'nsattributedstring', 'nsobject', 'nsdictionary', 'nsmutable',
            'nsstring', 'nsnumber', 'nsvalue', 'streamtyped', '__kim'
        ]
        
        for artifact in artifacts:
            if artifact in lower:
                return True
        
        # Filter out binary plist markers
        if re.search(r'\$version|\$archiver|\$top|\$objects|X\$|Y\$|T\$|Z\$', text):
            return True
        
        # Filter out NS. patterns
        if re.search(r'NS\.(rangeval|special|location|objects|classname)', text, re.IGNORECASE):
            return True
        
        # Filter out pure numbers
        if re.match(r'^\d+$', text):
            return True
        
        return False
    
    def _clean_binary_artifacts(self, text: str) -> str:
        """Remove binary artifact patterns from text"""
        if not text:
            return text
        
        cleaned = text
        
        # Remove binary plist patterns
        cleaned = re.sub(r'[XYZ]\$[a-zA-Z]+', '', cleaned)
        cleaned = re.sub(r'T\$[a-zA-Z]+', '', cleaned)
        cleaned = re.sub(r'\$[a-zA-Z]+', '', cleaned)
        
        # Remove NS. patterns
        cleaned = re.sub(r'NS\.[a-zA-Z]+', '', cleaned)
        cleaned = re.sub(r'[A-Z]NS\.[a-zA-Z]+', '', cleaned)
        
        # Remove NSObject class names
        cleaned = re.sub(r'\b(NSAttributedString|NSObject|NSDictionary|NSMutable|NSString|NSNumber|NSValue|NSArray|NSData)\b', '', cleaned, flags=re.IGNORECASE)
        
        # Remove streamtyped
        cleaned = re.sub(r'\bstreamtyped\b', '', cleaned, flags=re.IGNORECASE)
        
        # Remove __kIM patterns
        cleaned = re.sub(r'\b__kIM\w+\b', '', cleaned, flags=re.IGNORECASE)
        
        # Remove patterns like "rangeval.location"
        cleaned = re.sub(r'\b(rangeval|special|location|objects|classname|archiver|version)\.[a-zA-Z]+\b', '', cleaned, flags=re.IGNORECASE)
        
        # Clean up multiple spaces
        cleaned = re.sub(r'\s+', ' ', cleaned)
        
        return cleaned.strip()
    
    def _extract_message_text(self, text: str | None, attributed_body: bytes | None) -> str | None:
        """
        Extract text from message, handling both plain text and attributedBody binary format.
        Based on the implementation from main.ts and imessage-db-exploration.md
        """
        # If plain text is available, use it
        if text:
            return text
        
        # Otherwise, try to extract from attributedBody
        if not attributed_body:
            return None
        
        try:
            text_chunks = []
            
            # Scan buffer for printable ASCII sequences
            text_start = -1
            text_length = 0
            
            for i, byte in enumerate(attributed_body):
                # Only printable ASCII (32-126)
                is_printable = 32 <= byte <= 126
                
                if is_printable:
                    if text_start == -1:
                        text_start = i
                    text_length += 1
                else:
                    # End of printable sequence - extract if long enough (at least 3 chars)
                    if text_length >= 3 and text_start != -1:
                        try:
                            chunk = attributed_body[text_start:text_start + text_length].decode('ascii', errors='ignore')
                            # Must contain letters and be meaningful
                            if len(chunk) >= 3 and re.search(r'[A-Za-z]', chunk):
                                trimmed = chunk.strip()
                                # Filter out binary artifacts
                                if not self._is_binary_artifact(trimmed):
                                    text_chunks.append(trimmed)
                        except:
                            pass
                    text_start = -1
                    text_length = 0
            
            # Handle text that extends to end of buffer
            if text_length >= 3 and text_start != -1:
                try:
                    chunk = attributed_body[text_start:text_start + text_length].decode('ascii', errors='ignore')
                    if len(chunk) >= 3 and re.search(r'[A-Za-z]', chunk):
                        trimmed = chunk.strip()
                        if not self._is_binary_artifact(trimmed):
                            text_chunks.append(trimmed)
                except:
                    pass
            
            if not text_chunks:
                return None
            
            # Remove duplicates and sort by length (longest first)
            unique_chunks = sorted(set(text_chunks), key=len, reverse=True)
            
            # Take the longest chunks (likely the actual message)
            top_chunks = [c for c in unique_chunks[:3] if len(c) >= 3 and not self._is_binary_artifact(c)]
            result = ' '.join(top_chunks)
            
            # If we didn't get good results, try all chunks
            if len(result) < 5:
                result = ' '.join(c for c in unique_chunks if not self._is_binary_artifact(c))
            
            # Final cleanup
            result = self._clean_binary_artifacts(result)
            
            # Filter out individual words that are artifacts
            words = [word for word in result.split() if not self._is_binary_artifact(word) and word]
            result = ' '.join(words)
            
            # Clean up whitespace
            result = re.sub(r'\s+', ' ', result).strip()
            
            # Must have meaningful content
            if len(result) < 2 or not re.search(r'[A-Za-z]', result):
                return None
            
            return result
            
        except Exception as e:
            print(f"Error extracting text from attributedBody: {e}")
            return None


class MemoryPipeline:
    """Pipeline to generate memory summaries for contacts"""
    
    def __init__(self, api_keys: Optional[List[str]] = None):
        if OpenAI is None:
            raise ImportError("OpenAI package not installed")
        
        # Load API keys from environment or arguments
        if api_keys is None:
            api_keys = []
            # Try loading multiple keys
            for i in range(1, 10):  # Support up to 9 keys
                key = os.environ.get(f"OPENAI_API_KEY_{i}")
                if key:
                    api_keys.append(key)
            
            # Fallback to single key
            if not api_keys:
                single_key = os.environ.get("OPENAI_API_KEY")
                if single_key:
                    api_keys.append(single_key)
        
        if not api_keys:
            raise ValueError("At least one OpenAI API key required. Set OPENAI_API_KEY or OPENAI_API_KEY_1, OPENAI_API_KEY_2, etc.")
        
        self.key_manager = OpenAIKeyManager(api_keys)
        self.db = ChatDatabase()
    
    @staticmethod
    def format_texting_style_summary(style: TextingStyleProfile) -> str:
        """Generate a human-readable summary of texting style metrics"""
        parts = []
        
        # Message length
        parts.append(f"Avg length: {style.avg_message_length:.1f} chars (median: {style.median_message_length:.1f})")
        
        # Word count
        parts.append(f"Avg words: {style.avg_words_per_message:.1f} (median: {style.median_words_per_message:.1f})")
        
        # Emoji usage
        if style.emoji_frequency > 0:
            emoji_str = " ".join(style.top_emojis[:3]) if style.top_emojis else ""
            parts.append(f"Emoji freq: {style.emoji_frequency:.2f}/msg" + (f" [{emoji_str}]" if emoji_str else ""))
        else:
            parts.append("Emoji freq: 0")
        
        # Response time
        if style.avg_response_time_minutes:
            parts.append(f"Avg response: {style.avg_response_time_minutes:.1f}min (median: {style.median_response_time_minutes:.1f}min)")
        
        # Conversation patterns
        parts.append(f"Msgs/conversation: {style.messages_per_conversation:.1f}")
        
        # Activity patterns
        if style.most_active_hours:
            hours_str = ", ".join(f"{h}:00" for h in style.most_active_hours)
            parts.append(f"Most active: {hours_str}")
        
        if style.typical_days_active:
            days_str = ", ".join(style.typical_days_active[:3])
            parts.append(f"Active days: {days_str}")
        
        return " | ".join(parts)
    
    def chunk_messages_by_week(self, messages: List[Message]) -> Dict[str, List[Message]]:
        """Group messages into weekly chunks"""
        weeks = defaultdict(list)
        
        for msg in messages:
            # Get the week key (year-week)
            week_key = msg.timestamp.strftime("%Y-W%W")
            weeks[week_key].append(msg)
        
        return dict(weeks)
    
    def chunk_messages_by_month(self, messages: List[Message]) -> Dict[str, List[Message]]:
        """Group messages into monthly chunks"""
        months = defaultdict(list)
        
        for msg in messages:
            month_key = msg.timestamp.strftime("%Y-%m")
            months[month_key].append(msg)
        
        return dict(months)
    
    def summarize_week(self, week_key: str, messages: List[Message]) -> Dict[str, Any]:
        """Generate a summary for a week of messages using OpenAI"""
        if not messages:
            return {"week": week_key, "summary": "No messages", "key_topics": []}
        
        # Format messages for GPT - include more for better detail extraction
        formatted_messages = []
        for msg in messages[:150]:  # Increased limit for more context
            sender = "Me" if msg.is_from_me else "Them"
            formatted_messages.append(f"{sender}: {msg.text}")
        
        conversation_text = "\n".join(formatted_messages)
        
        prompt = f"""Analyze this week's conversation and provide SPECIFIC, DETAILED information.

Focus on CONCRETE FACTS:
- Names of people, companies, places, restaurants, events mentioned
- Specific plans made (with dates, times, locations if mentioned)
- Work/school updates (project names, company names, course names)
- Life events (moves, job changes, purchases - be specific)
- Activities done or planned (specific movies, restaurants, trips with names)
- Decisions made (what specifically was decided)
- Problems discussed (be specific about the issue)

DO NOT:
- Give vague summaries ("discussed work", "made plans")
- Use general topics without specifics
- Focus on sentiment or emotions

WRITE LIKE:
✓ "Discussed their onboarding at Meta, working on Feed Ranking team under Sarah Chen. Starting March 1st."
✓ "Made plans to meet at Chipotle on University Ave at 6pm on Friday"
✓ "They're deciding between Stanford CS PhD and Google L4 offer ($180k base)"
✗ "Talked about their new job and excitement"
✗ "Made weekend plans"

Week: {week_key}
Messages ({len(messages)} total, showing first 150):
{conversation_text}

Provide a detailed, factual summary. Include ALL specific names, places, companies, dates, and concrete details mentioned. Be comprehensive."""
        
        def make_api_call(client):
            return client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts specific facts and details from conversations. Focus on concrete information like names, places, dates, and outcomes."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=500
            )
        
        try:
            response = self.key_manager.call_with_retry(make_api_call)
            summary = response.choices[0].message.content
            
            return {
                "week": week_key,
                "message_count": len(messages),
                "summary": summary,
                "date_range": f"{messages[0].timestamp.date()} to {messages[-1].timestamp.date()}"
            }
        except Exception as e:
            print(f"Error summarizing week {week_key}: {e}")
            return {
                "week": week_key,
                "message_count": len(messages),
                "summary": "Error generating summary",
                "date_range": ""
            }
    
    def generate_month_highlights(self, month_key: str, messages: List[Message]) -> Dict[str, Any]:
        """Generate highlights for a month using OpenAI"""
        if not messages:
            return {"month": month_key, "highlights": "No messages"}
        
        # Sample messages throughout the month - more samples for detailed extraction
        sample_size = min(300, len(messages))
        step = max(1, len(messages) // sample_size)
        sampled = messages[::step]
        
        formatted_messages = []
        for msg in sampled:
            sender = "Me" if msg.is_from_me else "Them"
            date = msg.timestamp.strftime("%Y-%m-%d")
            formatted_messages.append(f"[{date}] {sender}: {msg.text}")
        
        conversation_text = "\n".join(formatted_messages)
        
        prompt = f"""Analyze this month's conversation and extract ALL SPECIFIC, DETAILED information.

Focus on CONCRETE FACTS:
- All people mentioned by name (colleagues, friends, family)
- All companies, schools, organizations mentioned
- All places visited or discussed (restaurants, cities, venues - with names)
- Specific work/school updates (projects, teams, courses, deadlines)
- Life changes (moves, job changes, relationship updates - be specific)
- Plans made (with dates and locations when mentioned)
- Activities done (specific movies seen, restaurants visited, trips taken)
- Purchases or decisions (what specifically was bought/decided)
- Events attended (conferences, concerts, parties - with names/dates)
- Problems or challenges (be specific about the issue and any resolutions)

DO NOT:
- Use vague language ("discussed career", "made plans")
- Summarize themes without specifics
- Focus on emotions or sentiment
- Leave out concrete details

WRITE DETAILED SUMMARIES LIKE:
✓ "Started new role at Anthropic on AI Safety team. Working on Constitutional AI project with team lead Amanda Chen. Discussing housing options in SF Mission District vs Noe Valley."
✓ "Visited Napa Valley wine country - went to Opus One and Stag's Leap wineries. Planning return trip for October harvest season."
✓ "Accepted offer at Jane Street as Quantitative Trader, $300k total comp. Deciding between NYC and London office. Start date July 15th."
✗ "Got a new job and discussed housing"
✗ "Went on a trip"

Month: {month_key}
Total messages: {len(messages)}
Date range: {messages[0].timestamp.date()} to {messages[-1].timestamp.date()}

{conversation_text}

Provide comprehensive monthly highlights with ALL specific facts, names, places, dates mentioned. Be thorough and detailed."""
        
        def make_api_call(client):
            return client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts detailed, specific facts from conversations. Focus on concrete information: names of people/places/companies, specific dates, outcomes, and factual details. Be comprehensive and thorough."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=800
            )
        
        try:
            response = self.key_manager.call_with_retry(make_api_call)
            highlights = response.choices[0].message.content
            
            return {
                "month": month_key,
                "message_count": len(messages),
                "highlights": highlights,
                "date_range": f"{messages[0].timestamp.date()} to {messages[-1].timestamp.date()}"
            }
        except Exception as e:
            print(f"Error generating highlights for {month_key}: {e}")
            return {
                "month": month_key,
                "message_count": len(messages),
                "highlights": "Error generating highlights"
            }
    
    def analyze_texting_style(self, messages: List[Message]) -> TextingStyleProfile:
        """Analyze the texting style of a contact based on their messages (not yours)"""
        # Filter to only their messages (not from me)
        their_messages = [m for m in messages if not m.is_from_me]
        
        if not their_messages:
            # Return default profile if no messages
            return TextingStyleProfile(
                avg_message_length=0, median_message_length=0,
                max_message_length=0, min_message_length=0,
                avg_words_per_message=0, median_words_per_message=0,
                emoji_frequency=0, top_emojis=[],
                avg_response_time_minutes=None, median_response_time_minutes=None,
                messages_per_conversation=0,
                most_active_hours=[], typical_days_active=[]
            )
        
        # Message length statistics
        lengths = [len(m.text) for m in their_messages]
        sorted_lengths = sorted(lengths)
        avg_length = sum(lengths) / len(lengths)
        median_length = sorted_lengths[len(lengths) // 2]
        max_length = max(lengths)
        min_length = min(lengths)
        
        # Word count statistics
        word_counts = [len(m.text.split()) for m in their_messages]
        sorted_words = sorted(word_counts)
        avg_words = sum(word_counts) / len(word_counts)
        median_words = sorted_words[len(word_counts) // 2]
        
        # Emoji analysis
        emoji_pattern = re.compile(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F700-\U0001F77F\U0001F780-\U0001F7FF\U0001F800-\U0001F8FF\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002702-\U000027B0\U000024C2-\U0001F251]+')
        total_emojis = 0
        emoji_counts = defaultdict(int)
        for m in their_messages:
            emojis = emoji_pattern.findall(m.text)
            total_emojis += len(emojis)
            for emoji in emojis:
                emoji_counts[emoji] += 1
        
        emoji_freq = total_emojis / len(their_messages)
        top_emojis = [emoji for emoji, _ in sorted(emoji_counts.items(), key=lambda x: x[1], reverse=True)[:5]]
        
        # Response time analysis (time between my message and their reply)
        response_times = []
        for i in range(len(messages) - 1):
            if messages[i].is_from_me and not messages[i + 1].is_from_me:
                time_diff = (messages[i + 1].timestamp - messages[i].timestamp).total_seconds() / 60
                if time_diff < 1440:  # Within 24 hours
                    response_times.append(time_diff)
        
        avg_response = sum(response_times) / len(response_times) if response_times else None
        median_response = sorted(response_times)[len(response_times) // 2] if response_times else None
        
        # Messages per conversation (rough estimate based on 1-hour gaps)
        conversation_gaps = sum(1 for i in range(len(their_messages) - 1) 
                               if (their_messages[i + 1].timestamp - their_messages[i].timestamp).total_seconds() > 3600)
        msgs_per_convo = len(their_messages) / max(conversation_gaps, 1)
        
        # Timing patterns - hours of day
        hours = [m.timestamp.hour for m in their_messages]
        hour_counts = defaultdict(int)
        for h in hours:
            hour_counts[h] += 1
        # Get top 3 most active hours
        top_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        most_active = [h for h, _ in top_hours]
        
        # Days of week activity
        days = [m.timestamp.strftime('%A') for m in their_messages]
        day_counts = defaultdict(int)
        for d in days:
            day_counts[d] += 1
        # Days with above-average activity
        avg_per_day = len(days) / 7
        active_days = [day for day, count in day_counts.items() if count > avg_per_day * 0.7]
        
        return TextingStyleProfile(
            avg_message_length=avg_length,
            median_message_length=median_length,
            max_message_length=max_length,
            min_message_length=min_length,
            avg_words_per_message=avg_words,
            median_words_per_message=median_words,
            emoji_frequency=emoji_freq,
            top_emojis=top_emojis,
            avg_response_time_minutes=avg_response,
            median_response_time_minutes=median_response,
            messages_per_conversation=msgs_per_convo,
            most_active_hours=most_active,
            typical_days_active=active_days
        )
    
    def extract_specific_moments(self, messages: List[Message]) -> List[Dict[str, Any]]:
        """
        Extract specific, factual moments from message history.
        Returns concrete facts: names, companies, places, outcomes, connections made.
        """
        if not messages or len(messages) < 50:
            return []
        
        # Sample important messages throughout the timeline
        # Prioritize longer messages as they're more likely to contain factual details
        sample_size = min(200, len(messages))
        step = max(1, len(messages) // sample_size)
        sampled = messages[::step]
        
        # Also include longer messages as they contain more details
        longer_messages = sorted([m for m in messages if len(m.text) > 50], 
                                key=lambda m: len(m.text), reverse=True)[:50]
        
        # Combine and deduplicate
        all_sampled = list({m.timestamp: m for m in (sampled + longer_messages)}.values())
        all_sampled.sort(key=lambda m: m.timestamp)
        sampled = all_sampled[:200]  # Cap at 200 total
        
        # Prepare messages for AI analysis with full context
        formatted_messages = []
        for msg in sampled:
            sender = "Me" if msg.is_from_me else "Them"
            date_str = msg.timestamp.strftime("%Y-%m-%d %H:%M")
            formatted_messages.append(f"[{date_str}] {sender}: {msg.text}")
        
        conversation_text = "\n".join(formatted_messages)
        
        prompt = f"""Analyze this conversation history and extract 8-15 SPECIFIC, FACTUAL moments with concrete details.

Focus on CONCRETE INFORMATION ONLY:
- WHO: Specific people mentioned by name (friends, colleagues, family, acquaintances)
- WHAT: Specific companies, organizations, schools, places, events with names
- OUTCOMES: Actual results (got the job, received offer, went to X, moved to Y)
- CONNECTIONS: Who you connected to whom, introductions made, referrals given
- PLANS: Specific trips, events, meetings with dates and locations
- LIFE CHANGES: Job changes (which company), moves (which city), school (which program)
- ACTIVITIES: Specific restaurants visited, movies watched, concerts attended, trips taken
- SHARED EXPERIENCES: Specific events you both participated in

DO NOT include:
- Vague emotional support ("helped with career")
- General conversations without specifics
- Quotes from messages
- Sentiment analysis

EXTRACT FACTS LIKE:
✓ "Connected them to interview at OpenAI, they received internship offer"
✓ "Went to Morimoto restaurant in NYC on June 15th"
✓ "They moved from SF to Austin to join Tesla"
✓ "Introduced them to John Smith at Google for coffee"
✓ "They got accepted to Stanford MBA program"
✓ "Planned trip to Tokyo for March 20-27, 2024"
✗ "Provided emotional support during job search"
✗ "Had a great conversation about their career"

Total messages: {len(messages)}
Timespan: {messages[0].timestamp.strftime('%B %d, %Y')} to {messages[-1].timestamp.strftime('%B %d, %Y')}

Conversation sample:
{conversation_text}

Return ONLY a valid JSON array in this exact format:
[
  {{
    "date": "2024-10-15",
    "description": "Detailed factual description with names, places, companies, outcomes"
  }}
]

Return ONLY the JSON array, no other text."""
        
        def make_api_call(client):
            return client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts concrete facts and specific information from conversations. Focus only on factual details like names, places, companies, outcomes. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,  # Lower temp for more factual extraction
                max_tokens=2000
            )
        
        try:
            response = self.key_manager.call_with_retry(make_api_call)
            result_text = response.choices[0].message.content.strip()
            
            # Try to parse JSON
            try:
                # Remove markdown code blocks if present
                if result_text.startswith("```"):
                    result_text = result_text.split("```")[1]
                    if result_text.startswith("json"):
                        result_text = result_text[4:]
                    result_text = result_text.strip()
                
                moments = json.loads(result_text)
                return moments if isinstance(moments, list) else []
            except json.JSONDecodeError as e:
                print(f"  Warning: Could not parse moments JSON: {e}")
                return []
                
        except Exception as e:
            print(f"  Error extracting specific moments: {e}")
            return []
    
    def analyze_relationship(self, messages: List[Message]) -> Dict[str, Any]:
        """Analyze relationship type and extract important moments"""
        if not messages:
            return {
                "relationship_type": "unknown",
                "description": "",
                "important_moments": [],
                "milestones": []
            }
        
        # Sample messages for analysis
        sample_size = min(300, len(messages))
        step = max(1, len(messages) // sample_size)
        sampled = messages[::step]
        
        formatted_messages = []
        for msg in sampled:
            sender = "Me" if msg.is_from_me else "Them"
            date = msg.timestamp.strftime("%Y-%m-%d")
            formatted_messages.append(f"[{date}] {sender}: {msg.text}")
        
        conversation_text = "\n".join(formatted_messages)
        
        prompt = f"""Analyze this conversation history and provide:

1. Relationship Type: (friend, family, romantic partner, colleague, acquaintance, etc.)
2. Relationship Description: Brief description of the relationship dynamics
3. Important Moments: List 3-5 significant moments or events mentioned
4. Milestones: List any major milestones (birthdays, anniversaries, achievements, life events)

Total messages: {len(messages)}
Timespan: {messages[0].timestamp.date()} to {messages[-1].timestamp.date()}

Sample conversation:
{conversation_text}

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{{
  "relationship_type": "...",
  "description": "...",
  "important_moments": ["...", "..."],
  "milestones": ["...", "..."]
}}

Return ONLY the JSON object, no other text."""
        
        def make_api_call(client):
            return client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that analyzes relationships. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=600
            )
        
        try:
            response = self.key_manager.call_with_retry(make_api_call)
            result_text = response.choices[0].message.content.strip()
            
            # Try to parse JSON from response
            try:
                # Remove markdown code blocks if present
                if result_text.startswith("```"):
                    result_text = result_text.split("```")[1]
                    if result_text.startswith("json"):
                        result_text = result_text[4:]
                    result_text = result_text.strip()
                
                result = json.loads(result_text)
            except json.JSONDecodeError as e:
                print(f"  Warning: Could not parse relationship JSON: {e}")
                # If not valid JSON, create structured response
                result = {
                    "relationship_type": "unknown",
                    "description": result_text,
                    "important_moments": [],
                    "milestones": []
                }
            
            return result
        except Exception as e:
            print(f"Error analyzing relationship: {e}")
            return {
                "relationship_type": "unknown",
                "description": f"Error: {str(e)}",
                "important_moments": [],
                "milestones": []
            }
    
    def process_contact(self, contact: Dict[str, Any], show_progress: bool = False) -> ContactMemory:
        """Process a single contact and generate their memory"""
        handle_id = contact['handle_id']
        
        # Get messages
        print(f"[{handle_id}] Loading messages...", flush=True)
        messages = self.db.get_messages_for_contact(handle_id)
        print(f"[{handle_id}] Loaded {len(messages)} messages", flush=True)
        
        if not messages:
            # Create default texting style
            default_style = TextingStyleProfile(
                avg_message_length=0, median_message_length=0,
                max_message_length=0, min_message_length=0,
                avg_words_per_message=0, median_words_per_message=0,
                emoji_frequency=0, top_emojis=[],
                avg_response_time_minutes=None, median_response_time_minutes=None,
                messages_per_conversation=0,
                most_active_hours=[], typical_days_active=[]
            )
            
            return ContactMemory(
                contact_id=handle_id,
                contact_name=contact.get('phone_number', handle_id),
                phone_number=contact.get('phone_number'),
                total_messages=0,
                texting_style=default_style,
                specific_moments=[],
                week_summaries=[],
                month_highlights=[],
                important_moments=[],
                milestones=[],
                relationship_type="unknown",
                relationship_description="No messages found",
                last_updated=datetime.now().isoformat()
            )
        
        # Chunk by week
        print(f"[{handle_id}] Chunking by week...", flush=True)
        weekly_chunks = self.chunk_messages_by_week(messages)
        
        # Summarize each week
        week_summaries = []
        weeks_list = sorted(weekly_chunks.keys())
        if show_progress:
            week_iter = tqdm(weeks_list, desc="📅 Weekly summaries", leave=False)
        else:
            week_iter = weeks_list
        
        for week_key in week_iter:
            summary = self.summarize_week(week_key, weekly_chunks[week_key])
            week_summaries.append(summary)
        print(f"[{handle_id}] Weekly summaries complete ({len(week_summaries)} weeks)", flush=True)
        
        # Chunk by month
        print(f"[{handle_id}] Chunking by month...", flush=True)
        monthly_chunks = self.chunk_messages_by_month(messages)
        
        # Generate monthly highlights
        month_highlights = []
        months_list = sorted(monthly_chunks.keys())
        if show_progress:
            month_iter = tqdm(months_list, desc="📊 Monthly highlights", leave=False)
        else:
            month_iter = months_list
        
        for month_key in month_iter:
            highlights = self.generate_month_highlights(month_key, monthly_chunks[month_key])
            month_highlights.append(highlights)
        print(f"[{handle_id}] Monthly highlights complete ({len(month_highlights)} months)", flush=True)
        
        # Analyze texting style
        print(f"[{handle_id}] Analyzing texting style...", flush=True)
        texting_style = self.analyze_texting_style(messages)
        print(f"[{handle_id}] Texting style analyzed", flush=True)
        
        # Extract specific moments with dates and quotes
        print(f"[{handle_id}] Extracting specific moments...", flush=True)
        specific_moments = self.extract_specific_moments(messages)
        print(f"[{handle_id}] Extracted {len(specific_moments)} moments", flush=True)
        
        # Analyze relationship
        print(f"[{handle_id}] Analyzing relationship...", flush=True)
        relationship_data = self.analyze_relationship(messages)
        print(f"[{handle_id}] Relationship analysis complete", flush=True)
        
        # Create memory object
        memory = ContactMemory(
            contact_id=handle_id,
            contact_name=contact.get('phone_number', handle_id),
            phone_number=contact.get('phone_number'),
            total_messages=len(messages),
            texting_style=texting_style,
            specific_moments=specific_moments,
            week_summaries=week_summaries,
            month_highlights=month_highlights,
            important_moments=relationship_data.get('important_moments', []),
            milestones=relationship_data.get('milestones', []),
            relationship_type=relationship_data.get('relationship_type', 'unknown'),
            relationship_description=relationship_data.get('description', ''),
            last_updated=datetime.now().isoformat()
        )
        
        return memory
    
    def _update_status(self, pbar, pbar_lock, contact_id: str, step: str):
        """Thread-safe status update"""
        if pbar and pbar_lock:
            with pbar_lock:
                pbar.set_postfix_str(f"{step}: {contact_id[-12:]}")
    
    def _process_and_save_contact(self, contact: Dict[str, Any], contact_num: int, total: int, output_dir: str, pbar: Optional[tqdm] = None, pbar_lock: Optional[threading.Lock] = None) -> Optional[ContactMemory]:
        """Process a single contact and save to file (for parallel execution)"""
        contact_id = contact['handle_id']
        
        try:
            # Process the contact
            self._update_status(pbar, pbar_lock, contact_id, "Processing")
            memory = self.process_contact(contact, show_progress=False)
            
            if memory.total_messages == 0:
                self._update_status(pbar, pbar_lock, contact_id, "No messages")
                if pbar and pbar_lock:
                    with pbar_lock:
                        pbar.update(1)
                return None
            
            # Save individual contact memory
            self._update_status(pbar, pbar_lock, contact_id, "Saving")
            memory_dict = asdict(memory)
            memory_dict['texting_style_summary'] = self.format_texting_style_summary(memory.texting_style)
            
            contact_file = Path(output_dir) / f"{memory.contact_id.replace('/', '_')}.json"
            with open(contact_file, 'w') as f:
                json.dump(memory_dict, f, indent=2)
            
            # Update progress bar thread-safely
            self._update_status(pbar, pbar_lock, contact_id, f"Done ({memory.total_messages} msgs)")
            if pbar and pbar_lock:
                with pbar_lock:
                    pbar.update(1)
            
            return memory
            
        except Exception as e:
            # Update progress bar thread-safely
            self._update_status(pbar, pbar_lock, contact_id, "Error")
            if pbar and pbar_lock:
                with pbar_lock:
                    pbar.update(1)
            
            print(f"\n❌ Error processing {contact_id}: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def run(self, output_dir: str = "./memory_output", top_n: int = 20, max_workers: int = 10):
        """Run the full pipeline with parallel processing"""
        print("\n" + "="*70)
        print("🚀 MEMORY PIPELINE - Starting".center(70))
        print("="*70)
        print(f"📁 Output: {output_dir}")
        print(f"⚙️  Workers: {max_workers} parallel")
        print(f"🎯 Target: Top {top_n} contacts")
        
        # Create output directory
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Get top contacts
        print(f"\n🔍 Finding top {top_n} contacts from last 6 months...")
        contacts = self.db.get_top_contacts(limit=top_n, months=6)
        print(f"✅ Found {len(contacts)} contacts to process")
        
        # Process contacts in parallel with progress bar
        print(f"\n{'='*70}")
        print(f"⚡ Processing {len(contacts)} contacts in parallel...")
        print(f"{'='*70}\n")
        
        all_memories = []
        pbar_lock = threading.Lock()
        
        with tqdm(total=len(contacts), desc="📱 Overall Progress", 
                 bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}]',
                 ncols=80) as pbar:
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all tasks
                future_to_contact = {
                    executor.submit(
                        self._process_and_save_contact, 
                        contact, 
                        i, 
                        len(contacts), 
                        output_dir,
                        pbar,
                        pbar_lock
                    ): contact 
                    for i, contact in enumerate(contacts, 1)
                }
                
                # Collect results as they complete
                for future in as_completed(future_to_contact):
                    memory = future.result()
                    if memory:
                        all_memories.append(memory)
        
        # Save summary of all contacts with style summaries
        print(f"\n{'='*70}")
        print("💾 Saving summary file...")
        summary_file = Path(output_dir) / "memory_summary.json"
        
        with tqdm(total=len(all_memories), desc="📝 Writing summary", leave=False) as pbar:
            all_memories_dict = []
            for m in all_memories:
                mem_dict = asdict(m)
                mem_dict['texting_style_summary'] = self.format_texting_style_summary(m.texting_style)
                all_memories_dict.append(mem_dict)
                pbar.update(1)
            
            with open(summary_file, 'w') as f:
                json.dump(all_memories_dict, f, indent=2)
        
        print(f"✅ Summary saved")
        
        # Final summary
        print(f"\n{'='*70}")
        print("✨ PIPELINE COMPLETE!".center(70))
        print("="*70)
        print(f"✅ Successfully processed: {len(all_memories)}/{len(contacts)} contacts")
        print(f"📊 Total messages analyzed: {sum(m.total_messages for m in all_memories):,}")
        print(f"📁 Output directory: {output_dir}")
        print(f"📄 Summary file: {summary_file}")
        print("="*70 + "\n")


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Memory Pipeline for iMessage contacts")
    parser.add_argument("--output", "-o", default="./memory_output", help="Output directory")
    parser.add_argument("--top", "-n", type=int, default=20, help="Number of top contacts to process")
    parser.add_argument("--workers", "-w", type=int, default=10, help="Number of parallel workers (default: 10)")
    parser.add_argument("--api-key", help="OpenAI API key (or set OPENAI_API_KEY env var)")
    parser.add_argument("--db-path", help="Path to chat.db (default: ~/Library/Messages/chat.db)")
    
    args = parser.parse_args()
    
    try:
        # Handle API key argument
        api_keys = None
        if args.api_key:
            api_keys = [args.api_key]
        
        pipeline = MemoryPipeline(api_keys=api_keys)
        pipeline.run(output_dir=args.output, top_n=args.top, max_workers=args.workers)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
