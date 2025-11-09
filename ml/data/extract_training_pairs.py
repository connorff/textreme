#!/usr/bin/env python3
"""
Extract prompt+completion training pairs from iMessage database.

Extracts conversation chunks from a specific contact's messages and formats them
as JSONL training data for LLM fine-tuning.
"""

import sqlite3
import json
import re
import os
import subprocess
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Tuple
from dataclasses import dataclass
from enum import Enum


# Constants
CHAT_DB_PATH = os.path.expanduser('~/Library/Messages/chat.db')
TARGET_PHONE = '+15152235896'
YEARS_BACK = 2
OUTPUT_FILE = 'ml/data/mom_training_pairs.jsonl'
USER_CHUNK_TIME_GAP_MINUTES = 30
MAX_CONVERSATION_WORDS = 1000

# Reaction type mapping
REACTION_MAP = {
    2000: "heart",
    2001: "thumbs_up", 
    2002: "thumbs_down",
    2003: "haha",
    2004: "exclamation",
    2005: "question",
    2006: "custom_emoji",
    2007: "sticker"
}


class MessageType(Enum):
    """Message type enumeration"""
    TEXT = "text"
    ATTACHMENT = "attachment"
    REACTION = "reaction"
    VOICE_MESSAGE = "voice_message"
    LOCATION = "location"
    APPLE_PAY = "apple_pay"
    DIGITAL_TOUCH = "digital_touch"
    HANDWRITING = "handwriting"


@dataclass
class Message:
    """Represents a single message with all relevant metadata"""
    chat_index: int
    guid: str
    type: MessageType
    timestamp: str
    sender: str
    content: Optional[str]
    reply_to_chat_index: Optional[int]
    reaction_to_chat_index: Optional[int]
    is_valid: bool
    is_valid_completion: bool
    date: int  # raw date for time gap calculation


@dataclass
class UserChunk:
    """Represents a contiguous sequence of messages from the same sender"""
    messages: List[Message]
    sender: str
    is_valid: bool
    is_valid_completion: bool


@dataclass
class ConversationChunk:
    """Represents a complete conversation chunk with prompt and completion"""
    user_chunks: List[UserChunk]
    
    @property
    def prompt_chunks(self) -> List[UserChunk]:
        """First n-1 user chunks"""
        return self.user_chunks[:-1]
    
    @property
    def completion_chunk(self) -> UserChunk:
        """Last user chunk"""
        return self.user_chunks[-1]


def apple_time_to_datetime(timestamp: int) -> Optional[datetime]:
    """Convert Apple epoch timestamp to Python datetime
    
    Apple epoch starts at Jan 1, 2001 00:00:00 UTC
    Timestamps are in nanoseconds
    """
    if timestamp is None:
        return None
    apple_epoch = datetime(2001, 1, 1)
    return apple_epoch + timedelta(seconds=timestamp / 1_000_000_000)


def extract_from_binary(attributed_body: bytes) -> Optional[str]:
    """Extract text from NSAttributedString using crabstep parser"""
    if not attributed_body:
        return None
    
    # path to crabstep binary
    script_dir = os.path.dirname(os.path.abspath(__file__))
    crabstep_bin = os.path.join(script_dir, '../crabstep/target/release/crabstep')
    
    try:
        result = subprocess.run(
            [crabstep_bin],
            input=attributed_body,
            capture_output=True,
            timeout=5
        )
        
        if result.returncode == 0:
            data = json.loads(result.stdout.decode('utf-8'))
            if data.get('success') and data.get('text'):
                # clean the extracted text to remove Apple metadata strings
                return clean_text(data['text'])
    except Exception:
        pass
    
    return None


def clean_text(text: str) -> Optional[str]:
    """Basic text normalization"""
    if not text:
        return None
    
    # remove known Apple metadata attribute names that crabstep extracts
    apple_metadata = [
        '__kIMMessagePartAttributeName',
        '__kIMCalendarEventAttributeName',
        '__kIMFileTransferGUIDAttributeName',
        '__kIMLinkAttributeName',
        '__kIMDataDetectedAttributeName',
        '__kIMFilenameAttributeName',
        '__kIMBaseWritingDirectionAttributeName',
        '__kIMLinkIsRichLinkAttributeName'
    ]
    
    for metadata in apple_metadata:
        text = text.replace(metadata, '')
    
    # normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text if text else None


def resolve_guid(guid: Optional[str]) -> Optional[str]:
    """Extract base GUID from special formats
    
    Handles:
    - 'p:0/GUID' -> 'GUID' (message parts)
    - 'bp:0/GUID' -> 'GUID' (balloon parts)
    - 'GUID' -> 'GUID' (regular)
    """
    if not guid:
        return None
    if guid.startswith('p:') or guid.startswith('bp:'):
        if '/' in guid:
            return guid.split('/', 1)[1]
    return guid


def get_attachment_type(conn: sqlite3.Connection, message_rowid: int) -> Optional[str]:
    """Get specific attachment type for a message"""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.mime_type
        FROM attachment a
        JOIN message_attachment_join maj ON a.ROWID = maj.attachment_id
        WHERE maj.message_id = ?
        LIMIT 1
    """, (message_rowid,))
    
    result = cursor.fetchone()
    if not result:
        return None
    
    mime_type = result[0]
    if mime_type:
        if mime_type.startswith('audio/'):
            return 'voice_message'
        elif mime_type == 'text/x-vlocation':
            return 'location'
    
    return 'attachment'


def get_message_type(row: Tuple, conn: sqlite3.Connection) -> MessageType:
    """Determine message type from database row"""
    (rowid, guid, date, text, attr_body, is_from_me, assoc_guid, assoc_type,
     reply_guid, has_attachments, balloon_bundle, expressive_style, date_edited) = row
    
    # check for reactions first
    if assoc_guid and assoc_type and 2000 <= assoc_type <= 2007:
        return MessageType.REACTION
    
    # check for special balloon types
    if balloon_bundle:
        if 'PeerPayment' in balloon_bundle:
            return MessageType.APPLE_PAY
        elif balloon_bundle == 'com.apple.DigitalTouchBalloonProvider':
            return MessageType.DIGITAL_TOUCH
        elif balloon_bundle == 'com.apple.Handwriting.HandwritingProvider':
            return MessageType.HANDWRITING
        # rich links become text messages
    
    # check for attachments
    if has_attachments:
        attachment_type = get_attachment_type(conn, rowid)
        if attachment_type == 'voice_message':
            return MessageType.VOICE_MESSAGE
        elif attachment_type == 'location':
            return MessageType.LOCATION
        else:
            return MessageType.ATTACHMENT
    
    # default to text
    return MessageType.TEXT


def extract_reaction_content(assoc_type: int, attr_body: Optional[bytes]) -> str:
    """Extract reaction content (emoji or standard type)"""
    # standard reactions
    if assoc_type in REACTION_MAP:
        reaction_name = REACTION_MAP[assoc_type]
        
        # for custom emoji, try to extract from attributedBody
        if assoc_type == 2006 and attr_body:
            try:
                decoded = attr_body.decode('utf-8', errors='ignore')
                # pattern: "Reacted <emoji> to ..."
                match = re.search(r'Reacted (.+?) to', decoded)
                if match:
                    return match.group(1)
            except Exception:
                pass
        
        return reaction_name
    
    return "unknown"


def extract_message_content(row: Tuple, msg_type: MessageType, conn: sqlite3.Connection) -> Optional[str]:
    """Extract content from message based on type"""
    (rowid, guid, date, text, attr_body, is_from_me, assoc_guid, assoc_type,
     reply_guid, has_attachments, balloon_bundle, expressive_style, date_edited) = row
    
    if msg_type == MessageType.REACTION:
        return extract_reaction_content(assoc_type, attr_body)
    
    if msg_type == MessageType.TEXT:
        # use text field if available, otherwise decode attributedBody
        content = text if text else extract_from_binary(attr_body)
        return content
    
    # other types have no content
    return None


def transform_messages(rows: List[Tuple], conn: sqlite3.Connection) -> List[Message]:
    """Transform database rows into Message objects"""
    messages = []
    guid_to_chat_index = {}
    
    # first pass: create all messages and build GUID index
    for chat_index, row in enumerate(rows):
        (rowid, guid, date, text, attr_body, is_from_me, assoc_guid, assoc_type,
         reply_guid, has_attachments, balloon_bundle, expressive_style, date_edited) = row
        
        msg_type = get_message_type(row, conn)
        content = extract_message_content(row, msg_type, conn)
        dt = apple_time_to_datetime(date)
        timestamp = dt.strftime('%Y-%m-%d %H:%M:%S') if dt else '1970-01-01 00:00:00'
        sender = "ME" if is_from_me else "Mom"
        
        # initial validation (will be updated after GUID resolution)
        is_valid = True
        is_valid_completion = msg_type in [MessageType.TEXT, MessageType.REACTION]
        
        message = Message(
            chat_index=chat_index,
            guid=guid,
            type=msg_type,
            timestamp=timestamp,
            sender=sender,
            content=content,
            reply_to_chat_index=None,  # will be resolved in second pass
            reaction_to_chat_index=None,  # will be resolved in second pass
            is_valid=is_valid,
            is_valid_completion=is_valid_completion,
            date=date
        )
        
        messages.append(message)
        guid_to_chat_index[guid] = chat_index
    
    # second pass: resolve GUIDs and validate
    for idx, message in enumerate(messages):
        row = rows[idx]
        (rowid, guid, date, text, attr_body, is_from_me, assoc_guid, assoc_type,
         reply_guid, has_attachments, balloon_bundle, expressive_style, date_edited) = row
        
        # resolve reply_to_guid
        if reply_guid:
            resolved_guid = resolve_guid(reply_guid)
            if resolved_guid in guid_to_chat_index:
                parent_index = guid_to_chat_index[resolved_guid]
                if parent_index < message.chat_index:
                    message.reply_to_chat_index = parent_index
                else:
                    # parent comes later, mark invalid
                    message.is_valid = False
            else:
                # parent doesn't exist, mark invalid
                message.is_valid = False
        
        # resolve associated_message_guid (reactions)
        if assoc_guid and message.type == MessageType.REACTION:
            resolved_guid = resolve_guid(assoc_guid)
            if resolved_guid in guid_to_chat_index:
                target_index = guid_to_chat_index[resolved_guid]
                if target_index < message.chat_index:
                    message.reaction_to_chat_index = target_index
                else:
                    # target comes later, mark invalid
                    message.is_valid = False
            else:
                # target doesn't exist, mark invalid
                message.is_valid = False
        
        # validate text content
        if message.type == MessageType.TEXT and not message.content:
            message.is_valid = False
    
    return messages


def create_user_chunks(messages: List[Message]) -> List[UserChunk]:
    """Group messages into user chunks by sender and time gap"""
    if not messages:
        return []
    
    chunks = []
    current_chunk_messages = [messages[0]]
    current_sender = messages[0].sender
    
    for i in range(1, len(messages)):
        msg = messages[i]
        prev_msg = messages[i - 1]
        
        # calculate time gap in minutes
        time_gap_seconds = (msg.date - prev_msg.date) / 1_000_000_000
        time_gap_minutes = time_gap_seconds / 60
        
        # check if we should start a new chunk
        if (msg.sender != current_sender or 
            time_gap_minutes > USER_CHUNK_TIME_GAP_MINUTES):
            # finalize current chunk
            chunk = create_user_chunk_from_messages(current_chunk_messages, current_sender)
            chunks.append(chunk)
            
            # start new chunk
            current_chunk_messages = [msg]
            current_sender = msg.sender
        else:
            current_chunk_messages.append(msg)
    
    # finalize last chunk
    if current_chunk_messages:
        chunk = create_user_chunk_from_messages(current_chunk_messages, current_sender)
        chunks.append(chunk)
    
    return chunks


def create_user_chunk_from_messages(messages: List[Message], sender: str) -> UserChunk:
    """Create a UserChunk from a list of messages"""
    # chunk is invalid if any message is invalid
    is_valid = all(msg.is_valid for msg in messages)
    
    # chunk is invalid for completion if any message is not valid for completion
    is_valid_completion = all(msg.is_valid_completion for msg in messages)
    
    return UserChunk(
        messages=messages,
        sender=sender,
        is_valid=is_valid,
        is_valid_completion=is_valid_completion
    )


def count_words_in_chunks(chunks: List[UserChunk]) -> int:
    """Count total words across all chunks"""
    total = 0
    for chunk in chunks:
        for msg in chunk.messages:
            if msg.content:
                total += len(msg.content.split())
    return total


def create_conversation_chunks(user_chunks: List[UserChunk]) -> List[ConversationChunk]:
    """Group user chunks into conversation chunks using sliding window"""
    if len(user_chunks) < 2:
        return []  # need at least 2 chunks (prompt + completion)
    
    conv_chunks = []
    window = []
    
    for chunk in user_chunks:
        # skip invalid chunks - they reset the window
        if not chunk.is_valid:
            window = []
            continue
        
        # add chunk to window
        window.append(chunk)
        
        # slide window if it exceeds word limit
        while len(window) >= 2 and count_words_in_chunks(window) > MAX_CONVERSATION_WORDS:
            window.pop(0)  # remove first chunk
        
        # create conversation chunk if valid
        if len(window) >= 2 and window[-1].is_valid_completion:
            word_count = count_words_in_chunks(window)
            if word_count <= MAX_CONVERSATION_WORDS:
                conv_chunk = ConversationChunk(user_chunks=window.copy())
                conv_chunks.append(conv_chunk)
    
    return conv_chunks


def format_message_annotation(message: Message, chunk_index: int, 
                              chat_to_chunk_index: Dict[int, int]) -> str:
    """Format a single message for the prompt part"""
    # build type annotation
    type_parts = []
    
    # handle replies
    if message.reply_to_chat_index is not None:
        parent_chunk_idx = chat_to_chunk_index.get(message.reply_to_chat_index)
        if parent_chunk_idx is not None:
            type_parts.append(f"reply:{parent_chunk_idx}")
    
    # handle reactions - add target before type
    if message.type == MessageType.REACTION and message.reaction_to_chat_index is not None:
        target_chunk_idx = chat_to_chunk_index.get(message.reaction_to_chat_index)
        if target_chunk_idx is not None:
            type_parts.append(f"reaction:{target_chunk_idx}")
    
    # add message type (but not if it's a reaction, since we already added it)
    if message.type != MessageType.REACTION:
        type_parts.append(message.type.value)
    
    type_annotation = ','.join(type_parts)
    
    # format content
    content_str = ""
    if message.content:
        # escape newlines for JSONL
        escaped_content = message.content.replace('\n', '\\n')
        content_str = f" {escaped_content}"
    
    return f"{chunk_index} [{message.timestamp}] {message.sender}: [{type_annotation}]{content_str}"


def format_completion_message(message: Message, chat_to_chunk_index: Dict[int, int]) -> Optional[str]:
    """Format a single message for the completion part"""
    # only include text and reactions
    if message.type not in [MessageType.TEXT, MessageType.REACTION]:
        return None
    
    # build type annotation
    type_parts = []
    
    # handle replies
    if message.reply_to_chat_index is not None:
        parent_chunk_idx = chat_to_chunk_index.get(message.reply_to_chat_index)
        if parent_chunk_idx is not None:
            type_parts.append(f"reply:{parent_chunk_idx}")
    
    # handle reactions - add target before type
    if message.type == MessageType.REACTION and message.reaction_to_chat_index is not None:
        target_chunk_idx = chat_to_chunk_index.get(message.reaction_to_chat_index)
        if target_chunk_idx is not None:
            type_parts.append(f"reaction:{target_chunk_idx}")
    
    # add message type (but not if it's a reaction, since we already added it)
    if message.type != MessageType.REACTION:
        type_parts.append(message.type.value)
    
    type_annotation = ','.join(type_parts)
    
    # format content
    content_str = ""
    if message.content:
        # escape newlines for JSONL
        escaped_content = message.content.replace('\n', '\\n')
        content_str = f" {escaped_content}"
    
    return f"[{type_annotation}]{content_str}"


def format_conversation_chunk(conv_chunk: ConversationChunk) -> Tuple[str, str]:
    """Format a conversation chunk as prompt and completion strings"""
    # build chat_index to chunk_index mapping
    chat_to_chunk_index = {}
    chunk_index = 0
    
    # map all messages in prompt + completion
    for user_chunk in conv_chunk.user_chunks:
        for message in user_chunk.messages:
            chat_to_chunk_index[message.chat_index] = chunk_index
            chunk_index += 1
    
    # format prompt (all messages in prompt_chunks)
    prompt_lines = []
    chunk_index = 0
    for user_chunk in conv_chunk.prompt_chunks:
        for message in user_chunk.messages:
            line = format_message_annotation(message, chunk_index, chat_to_chunk_index)
            prompt_lines.append(line)
            chunk_index += 1
    
    prompt = '\n'.join(prompt_lines)
    
    # format completion (only text/reaction messages from completion_chunk)
    completion_lines = []
    for message in conv_chunk.completion_chunk.messages:
        line = format_completion_message(message, chat_to_chunk_index)
        if line:
            completion_lines.append(line)
    
    completion = '\n'.join(completion_lines)
    
    return prompt, completion


def main():
    """Main execution function"""
    print(f"Extracting training pairs from {CHAT_DB_PATH}")
    print(f"Target phone: {TARGET_PHONE}")
    print(f"Time range: Last {YEARS_BACK} years")
    print()
    
    # connect to database
    conn = sqlite3.connect(CHAT_DB_PATH)
    cursor = conn.cursor()
    
    # find chat_id for target phone
    cursor.execute("""
        SELECT c.ROWID 
        FROM chat c 
        WHERE c.chat_identifier LIKE ? AND c.style = 45
    """, (f'%{TARGET_PHONE.replace("+", "")}%',))
    
    result = cursor.fetchone()
    if not result:
        print(f"ERROR: Could not find chat for phone {TARGET_PHONE}")
        return
    
    chat_id = result[0]
    print(f"Found chat ID: {chat_id}")
    
    # calculate date threshold
    now = datetime.now()
    threshold_date = now - timedelta(days=YEARS_BACK * 365)
    apple_epoch = datetime(2001, 1, 1)
    threshold_timestamp = int((threshold_date - apple_epoch).total_seconds() * 1_000_000_000)
    
    print(f"Date threshold: {threshold_date.strftime('%Y-%m-%d')}")
    
    # extract messages
    cursor.execute("""
        SELECT m.ROWID, m.guid, m.date, m.text, m.attributedBody, m.is_from_me,
               m.associated_message_guid, m.associated_message_type, m.reply_to_guid,
               m.cache_has_attachments, m.balloon_bundle_id, m.expressive_send_style_id,
               m.date_edited
        FROM chat_message_join cmj
        JOIN message m ON cmj.message_id = m.ROWID
        WHERE cmj.chat_id = ? AND m.item_type = 0 
          AND m.date >= ?
          AND (m.associated_message_type NOT BETWEEN 3000 AND 3005 
               OR m.associated_message_type IS NULL)
        ORDER BY m.ROWID ASC
    """, (chat_id, threshold_timestamp))
    
    rows = cursor.fetchall()
    print(f"Extracted {len(rows)} messages")
    
    if not rows:
        print("No messages found in date range")
        return
    
    # transform messages
    print("Transforming messages...")
    messages = transform_messages(rows, conn)
    
    valid_messages = [m for m in messages if m.is_valid]
    print(f"Valid messages: {len(valid_messages)}/{len(messages)}")
    
    # create user chunks
    print("Creating user chunks...")
    user_chunks = create_user_chunks(messages)
    print(f"Created {len(user_chunks)} user chunks")
    
    valid_user_chunks = [c for c in user_chunks if c.is_valid]
    print(f"Valid user chunks: {len(valid_user_chunks)}")
    
    # create conversation chunks
    print("Creating conversation chunks...")
    conv_chunks = create_conversation_chunks(user_chunks)
    print(f"Created {len(conv_chunks)} conversation chunks")
    
    # format and write to JSONL
    print(f"Writing to {OUTPUT_FILE}...")
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    with open(OUTPUT_FILE, 'w') as f:
        for conv_chunk in conv_chunks:
            prompt, completion = format_conversation_chunk(conv_chunk)
            
            # create JSONL entry
            entry = {
                "context": prompt,
                "response": completion
            }
            
            f.write(json.dumps(entry) + '\n')
    
    print()
    print("=" * 60)
    print("EXTRACTION COMPLETE")
    print("=" * 60)
    print(f"Total messages extracted: {len(rows)}")
    print(f"Valid messages: {len(valid_messages)}")
    print(f"User chunks created: {len(user_chunks)}")
    print(f"Valid user chunks: {len(valid_user_chunks)}")
    print(f"Conversation chunks: {len(conv_chunks)}")
    print(f"Output file: {OUTPUT_FILE}")
    print()
    
    conn.close()


if __name__ == '__main__':
    main()

