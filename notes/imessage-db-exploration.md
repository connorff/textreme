# iMessage Database Exploration Guide

A comprehensive guide to reading, querying, and decoding Apple's iMessage database (`chat.db`).

---

## Table of Contents

1. [Database Overview](#database-overview)
2. [Understanding the Schema](#understanding-the-schema)
3. [Text vs AttributedBody Storage](#text-vs-attributedbody-storage)
4. [Basic Queries](#basic-queries)
5. [Decoding Binary Messages](#decoding-binary-messages)
6. [Date Format Conversion](#date-format-conversion)
7. [Message Types and Features](#message-types-and-features)
8. [Edited and Unsent Messages](#edited-and-unsent-messages)
9. [Replies and Threads](#replies-and-threads)
10. [Group Chats](#group-chats)
11. [Reactions and Tapbacks](#reactions-and-tapbacks)
12. [Stickers and Memoji](#stickers-and-memoji)
13. [Displaying Conversations](#displaying-conversations)
14. [Advanced Techniques](#advanced-techniques)

---

## Database Overview

The iMessage database is an SQLite database typically located at:

- macOS: `~/Library/Messages/chat.db`
- iOS Backup: `3d0d7e5fb2ce288813306e4d4636395e047a3d28` (hashed filename)

### Key Statistics Commands

```bash
# Open the database
sqlite3 ~/Desktop/chat.db

# Count records in main tables
SELECT 'Messages: ' || COUNT(*) FROM message;
SELECT 'Chats: ' || COUNT(*) FROM chat;
SELECT 'Handles: ' || COUNT(*) FROM handle;
SELECT 'Attachments: ' || COUNT(*) FROM attachment;
```

---

## Understanding the Schema

### Main Tables

#### 1. `message` - Core message content

```sql
-- View the schema
.schema message

-- Key columns:
-- ROWID: Unique message identifier
-- guid: Global unique identifier
-- text: Plain text content (if available)
-- attributedBody: Binary NSAttributedString (rich text)
-- date: Timestamp in Apple epoch format
-- is_from_me: 1 if sent by you, 0 if received
-- handle_id: Foreign key to sender
-- cache_has_attachments: 1 if message has media
-- item_type: 0=regular message, others=special types
-- associated_message_guid: For reactions/replies
```

#### 2. `chat` - Conversation metadata

```sql
-- View the schema
.schema chat

-- Key columns:
-- ROWID: Unique chat identifier
-- chat_identifier: Phone number or group ID
-- display_name: Custom name for chat
-- style: 43=group chat, 45=one-on-one
-- service_name: iMessage, SMS, RCS
```

#### 3. `handle` - Contact information

```sql
-- View the schema
.schema handle

-- Key columns:
-- ROWID: Unique handle identifier
-- id: Phone number or email
-- service: iMessage, SMS, RCS
```

#### 4. `chat_message_join` - Links messages to chats

```sql
-- View the schema
.schema chat_message_join

-- Links chat_id to message_id (many-to-many)
```

#### 5. `attachment` - Media files

```sql
-- View the schema
.schema attachment

-- Key columns:
-- filename: Full path to media file
-- mime_type: File type (image/jpeg, video/quicktime, etc.)
-- transfer_name: Original filename
```

---

## Text vs AttributedBody Storage

### Critical Understanding

Messages store content in TWO possible locations:
1. **`text` field**: Plain text (may be empty)
2. **`attributedBody` field**: Binary NSAttributedString (always present for formatted messages)

### Storage Pattern by Service Type

| Service | Text Field Populated | Reason |
|---------|---------------------|--------|
| **iMessage** | 0.4% | Almost always uses `attributedBody` only due to rich text features |
| **SMS** | 6.7% | Sometimes populates both fields (simpler protocol) |
| **RCS** | 9.9% | Sometimes populates both fields (newer but simpler than iMessage) |

### When Only attributedBody is Used

iMessage stores content ONLY in `attributedBody` when messages contain:
- Rich text formatting (bold, italic, underline)
- @ mentions
- Threaded replies (37.5% of messages)
- Message effects (slam, loud, gentle, etc.)
- Tapbacks/reactions
- Links with rich previews
- Data detection (addresses, phone numbers, dates)
- **ANY** special formatting or metadata

**Note:** Even regular non-reply iMessages have 98.7% empty text field. The text field being empty is the default for iMessage, not the exception.

### Parsing Strategy

**Always use this order:**
```python
content = message.text if message.text else extract_from_binary(message.attributedBody)
```

**Never assume** `text` field is populated - 99.2% of iMessages require decoding `attributedBody`.

---

## Basic Queries

### Get Message Counts by Service

```sql
SELECT service, COUNT(*) as count
FROM message
GROUP BY service
ORDER BY count DESC;
```

### Find Most Active Chats

```sql
SELECT
  c.display_name,
  c.chat_identifier,
  COUNT(cmj.message_id) as message_count
FROM chat c
LEFT JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
GROUP BY c.ROWID
ORDER BY message_count DESC
LIMIT 10;
```

### Get Sent vs Received Breakdown

```sql
SELECT
  CASE WHEN is_from_me = 1 THEN 'Sent by me' ELSE 'Received' END as direction,
  COUNT(*) as count
FROM message
GROUP BY is_from_me;
```

### Find Messages with Attachments

```sql
SELECT
  m.ROWID,
  m.text,
  a.mime_type,
  a.filename
FROM message m
INNER JOIN message_attachment_join maj ON m.ROWID = maj.message_id
INNER JOIN attachment a ON maj.attachment_id = a.ROWID
LIMIT 10;
```

---

## Decoding Binary Messages

### The Problem

Messages with rich formatting are stored in `attributedBody` as binary `NSAttributedString` objects instead of plain text.

### Solution: Python Decoder

```python
import sqlite3
import re
from datetime import datetime, timedelta

def clean_text(text):
    """Remove Apple binary artifacts from extracted text"""
    if not text:
        return None

    # Remove common binary artifacts
    artifacts = [
        'streamtyped', 'NSAttributedString', 'NSObject', 'NSString',
        'NSDictionary', '__kIMMessagePartAttributeName', 'NSNumber',
        'NSValue', '__kIMBaseWritingDirectionAttributeName',
        'NSMutableAttributedString', 'NSMutableString'
    ]

    for artifact in artifacts:
        text = text.replace(artifact, '')

    # Remove encoding markers like "@ +" and "iI i *"
    text = re.sub(r'@\s*\+[A-Za-z0-9,.\-]*\s*', '', text)
    text = re.sub(r'\s+iI\s+[^\s]*\s+i\s+\*', '', text)
    text = re.sub(r'\s+iI\s+\*', '', text)

    # Clean up spaces
    text = re.sub(r'\s+', ' ', text).strip()

    return text if text else None

def extract_from_binary(attributed_body):
    """Extract readable text from NSAttributedString binary format"""
    if not attributed_body:
        return None
    try:
        # Decode as UTF-8 with error handling
        text = attributed_body.decode('utf-8', errors='ignore')

        # Remove control characters but keep spaces
        cleaned = re.sub(r'[\x00-\x08\x0b-\x1f\x7f-\x9f]', ' ', text)

        return clean_text(cleaned)
    except:
        return None

# Usage in query
conn = sqlite3.connect('~/Desktop/chat.db')
cursor = conn.cursor()

cursor.execute("""
    SELECT ROWID, text, attributedBody, is_from_me
    FROM message
    WHERE item_type = 0
    ORDER BY date ASC
    LIMIT 100
""")

for rowid, text, attr_body, is_from_me in cursor.fetchall():
    # Use text if available, otherwise decode attributedBody
    content = text if text else extract_from_binary(attr_body)

    if content:
        sender = "YOU" if is_from_me else "THEM"
        print(f"{sender}: {content}")

conn.close()
```

---

## Date Format Conversion

### Apple's Date Format

Apple uses nanoseconds since January 1, 2001, 00:00:00 UTC (the "Core Data" or "Cocoa" epoch).

### Conversion Function

```python
from datetime import datetime, timedelta

def apple_time_to_datetime(timestamp):
    """Convert Apple epoch timestamp to Python datetime"""
    if timestamp is None:
        return None

    # Apple epoch starts at Jan 1, 2001
    apple_epoch = datetime(2001, 1, 1)

    # Timestamp is in nanoseconds, convert to seconds
    return apple_epoch + timedelta(seconds=timestamp / 1000000000)

# Usage example
timestamp = 725713456509362176
readable_date = apple_time_to_datetime(timestamp)
print(readable_date)  # Output: 2023-12-31 03:04:16
```

### SQL Date Conversion

```sql
-- Convert Apple timestamp to readable format
SELECT
  datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as readable_date
FROM message
LIMIT 10;
```

---

## Message Types and Features

### Item Types (`item_type` field)

| Type | Count | Description |
|------|-------|-------------|
| 0 | 99.74% | Regular messages (text, attachments, reactions) |
| 1 | 0.17% | Group chat actions (person joined/left) |
| 2 | 0.05% | System events |
| 3 | 0.01% | Group actions with attachments |
| 4-6 | <0.01% | Other special types |

**Always filter** `WHERE item_type = 0` to get only regular messages.

### Multi-Part Messages

Messages can be split into multiple parts (`part_count` field):
- Most messages: `part_count = 1`
- Long messages: `part_count = 2-43`
- Parts are reassembled by the client

### Service Types

```sql
SELECT service, COUNT(*) as count
FROM message
GROUP BY service;
```

Available services:
- **iMessage**: Rich messaging protocol (Apple devices only)
- **SMS**: Standard text messages
- **RCS**: Rich Communication Services (Android)
- **iMessageLite**: Lite version
- **SatelliteSMS**: Emergency satellite messaging

### Status Flags

Important boolean fields:
- `is_from_me`: 1 if you sent it, 0 if received
- `is_read`: Has been read
- `is_sent`: Successfully sent
- `is_delivered`: Delivered to recipient
- `is_finished`: Processing complete
- `was_downgraded`: Fell back from iMessage to SMS (rare: 0.001%)
- `was_delivered_quietly`: Delivered without notification (2.4%)

---

## Edited and Unsent Messages

### Edited Messages (iOS 16+)

Edited messages are identified by `date_edited` field:

```sql
SELECT 
  ROWID,
  datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as sent,
  datetime(date_edited/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as edited,
  text,
  attributedBody
FROM message
WHERE date_edited IS NOT NULL AND date_edited > 0;
```

**Key characteristics:**
- `text` field is **ALWAYS empty** (NULL)
- Current content stored in `attributedBody` only
- Edit history may be in `message_summary_info` (binary plist)
- Can be edited up to 5 times within 15 minutes

### Unsent Messages (iOS 16+)

Unsent/retracted messages:
- Both `text` AND `attributedBody` are NULL
- `date_retracted` field contains timestamp
- Can be unsent within 2 minutes of sending
- May still be visible on older iOS versions

```sql
SELECT ROWID, date_retracted
FROM message
WHERE date_retracted IS NOT NULL AND date_retracted > 0;
```

---

## Replies and Threads

### How Reply Chains Work

**CRITICAL:** Reply structures differ dramatically between 1:1 and group chats!

#### Structure Overview

Replies can form either:
1. **Linear chains** (linked list): Each message replies to the previous one
2. **Branching trees**: Multiple messages reply to the same parent

```
Linear Chain:
Message A (root)
  └─> Message B (replies to A)
        └─> Message C (replies to B)

Branching Tree:
Message A (root)
  ├─> Message B (person 1 replies)
  ├─> Message C (person 2 replies)
  └─> Message D (person 3 replies)
        └─> Message E (person 1 replies to D)
```

### Threaded Replies Fields

```sql
-- Get a reply and its parent
SELECT 
  m.ROWID,
  m.text,
  m.reply_to_guid,
  m.thread_originator_guid,
  parent.ROWID as parent_rowid,
  parent.text as parent_text
FROM message m
LEFT JOIN message parent ON m.thread_originator_guid = parent.guid
WHERE m.thread_originator_guid IS NOT NULL
LIMIT 10;
```

**⚠️ CRITICAL: Two Different Fields**

The database has TWO fields that look like replies but serve different purposes:

1. **`reply_to_guid`** (37.7% of messages)
   - **Purpose**: Internal iMessage field (NOT user-visible threaded replies)
   - Possibly used for keyboard suggestions, autocomplete, or message flow
   - Most messages have this set (30-40%)
   - **DO NOT USE for detecting threaded replies**

2. **`thread_originator_guid`** (3.1% of messages) ✅
   - **Purpose**: Actual threaded reply feature users see in UI
   - Set when user uses "Reply" swipe gesture in iMessage
   - Points to the message being replied to
   - **USE THIS for detecting threaded replies**

3. **`thread_originator_part`**: Part number in multi-part thread messages (format: "0:0:26")

**Example showing the difference:**
```sql
-- Message with reply_to_guid but NOT thread_originator_guid (NOT a threaded reply)
-- "Have you been working from there?" 
-- reply_to_guid points to "Want to take a quick nap" (34s earlier)
-- thread_originator_guid is NULL
-- → Just conversation flow, not a threaded reply

-- Message with thread_originator_guid (IS a threaded reply)
-- "Maybe, but tomorrow might be better"
-- reply_to_guid is NULL  
-- thread_originator_guid points to "Do you wanna talk tonight?" (32min earlier)
-- → User explicitly used Reply gesture
```

**General Statistics (CORRECTED):**
- **3.1%** of messages are threaded replies (using `thread_originator_guid`)
- 37.7% of messages have `reply_to_guid` (internal field, NOT threaded replies)
- Reply chains can be **very long** (20+ messages in a single thread)
- Reply messages virtually ALWAYS have empty `text` field (100%)
- Non-reply messages also have empty `text` field most of the time (98.7%)

### Reply Structure by Chat Type

#### 1:1 Chats (style = 45)

**Branching Behavior:**
- **99.0% linear** (one reply per parent message)
- **1.0% branching** (multiple replies to same parent)
- Maximum observed: **165 messages** replying to a single parent
- Average branches when branching occurs: **7.5 messages**

**When Branching Occurs in 1:1:**
- **Primary cause**: Group SMS conversations
  - SMS doesn't support proper group chat threading
  - All participants appear to send from one phone number
  - Multiple people's replies to the same message create branches
- **Real-world example**: Group text where multiple friends reply to one person's message

**Reconstruction Strategy for 1:1:**
```python
# Generally safe to assume linear chain, but handle branches defensively
def get_children(conn, parent_guid):
    """Get all messages replying to a parent (may be 0, 1, or many)"""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT ROWID, guid, date, is_from_me, text, attributedBody
        FROM message
        WHERE reply_to_guid = ?
        ORDER BY date
    """, (parent_guid,))
    return cursor.fetchall()
```

#### Group Chats (style = 43)

**Branching Behavior:**
- **98.97% linear** (one reply per parent message)
- **1.03% branching** (multiple replies to same parent)
- Maximum observed: **282 messages** replying to a single parent
- Average branches when branching occurs: **12 messages**
- Branching typically involves **multiple different people** (up to 10+ participants)

**When Branching Occurs in Groups:**
- **Primary cause**: Multiple people replying to the same message
  - Natural conversation pattern in group chats
  - One person says something interesting
  - Multiple people reply simultaneously
- **Real-world example**: Someone shares a photo, 10 people all react with separate replies

**Reconstruction Strategy for Groups:**
```python
# MUST handle branching - it's a natural part of group conversations
def build_reply_tree(conn, root_guid):
    """Build full tree structure of all replies"""
    def get_subtree(guid):
        cursor = conn.cursor()
        cursor.execute("""
            SELECT ROWID, guid, date, handle_id, text, attributedBody
            FROM message
            WHERE reply_to_guid = ?
            ORDER BY date
        """, (guid,))
        
        children = []
        for row in cursor.fetchall():
            child_guid = row[1]
            child_node = {
                'message': row,
                'children': get_subtree(child_guid)  # Recursive
            }
            children.append(child_node)
        return children
    
    return get_subtree(root_guid)
```

### Key Takeaways for Developers

**⚠️ Critical Edge Case:**
- **DO NOT assume** 1:1 mapping between parent and child messages
- **~1% of parent messages have multiple children** (both 1:1 and group chats)
- **Always query for children as a list**, not a single message
- **Group chats**: Branching is a natural conversation pattern
- **1:1 chats**: Branching usually indicates group SMS (multiple people, one number)

**Safe Reconstruction Pattern:**
```python
# ✅ SAFE: Always handles 0, 1, or many children
children = get_all_children(parent_guid)

# ❌ UNSAFE: Assumes exactly one child
child = get_single_child(parent_guid)  # Will fail or miss data on 1% of messages
```

### Reconstructing Full Reply Chains

To walk up the reply chain from any message to its root:

```python
def get_reply_chain(conn, start_guid, max_depth=100):
    """Walk up the reply chain to the root message"""
    cursor = conn.cursor()
    chain = []
    current_guid = start_guid
    visited = set()
    
    for i in range(max_depth):
        if current_guid in visited:
            break  # Prevent infinite loops
        visited.add(current_guid)
        
        cursor.execute("""
            SELECT 
                ROWID,
                guid,
                date,
                reply_to_guid,
                thread_originator_guid,
                is_from_me,
                text,
                attributedBody
            FROM message
            WHERE guid = ?
        """, (current_guid,))
        
        result = cursor.fetchone()
        if not result:
            break
        
        chain.append(result)
        
        # Get parent message
        reply_to_guid = result[3]
        if not reply_to_guid:
            # Reached the root
            break
        
        current_guid = reply_to_guid
    
    # Reverse to get chronological order (oldest first)
    return list(reversed(chain))

# Usage
chain = get_reply_chain(conn, 'MESSAGE-GUID-HERE')
print(f"Chain has {len(chain)} messages from root to current")
```

### Finding All Replies to a Message

To walk **down** the tree (find all descendants):

```sql
-- Find immediate children (direct replies)
SELECT 
  m.ROWID,
  m.guid,
  m.is_from_me,
  m.text
FROM message m
WHERE m.reply_to_guid = 'PARENT-MESSAGE-GUID';
```

**Note:** There's no built-in way to get all descendants in one query. You must recursively follow `reply_to_guid` relationships.

---

## Group Chats

### Identifying Group Chats

```sql
SELECT 
  ROWID,
  chat_identifier,
  display_name,
  style,
  service_name
FROM chat
WHERE style = 43  -- Group chats
ORDER BY ROWID DESC
LIMIT 10;
```

**Chat styles:**
- `43`: Group chat
- `45`: One-on-one chat

### Group Participants

```sql
-- Get participants in a group chat
SELECT 
  c.display_name,
  h.id as participant
FROM chat c
INNER JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
INNER JOIN handle h ON chj.handle_id = h.ROWID
WHERE c.ROWID = ?  -- Replace with chat ROWID
ORDER BY h.id;
```

### Group Actions

Group actions are stored with `group_action_type`:
- Type 1: Person joined/left (most common)
- Type 3: Other group events
- These have `item_type = 1` or `item_type = 3`

---

## Reactions and Tapbacks

### Reaction Types

Reactions link to original messages via `associated_message_guid`:

```sql
SELECT 
  associated_message_type,
  COUNT(*) as count
FROM message
WHERE associated_message_guid IS NOT NULL
GROUP BY associated_message_type
ORDER BY count DESC;
```

**Reaction codes:**
- `2000`: Love ❤️ (38.1%)
- `2001`: Like 👍 (17.1%)
- `2002`: Dislike 👎 (3.2%)
- `2003`: Laugh 😂 (17.7%)
- `2004`: Emphasize ‼️ (13.6%)
- `2005`: Question ❓ (1.0%)
- `2006`: Custom emoji reaction
- `3000-3005`: Remove reaction (undo)

### Getting Reactions for a Message

```sql
SELECT 
  m.ROWID,
  m.associated_message_type,
  m.associated_message_emoji,
  h.id as reactor
FROM message m
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE m.associated_message_guid = 'MESSAGE-GUID-HERE';
```

---

## Stickers and Memoji

### Sticker Messages

Stickers are stored in the `attachment` table with special flags:

```sql
SELECT 
  a.ROWID,
  a.filename,
  a.mime_type,
  a.is_sticker,
  a.emoji_image_content_identifier,
  a.emoji_image_short_description
FROM attachment a
WHERE a.is_sticker = 1
LIMIT 10;
```

**Key fields:**
- `is_sticker`: 1 for stickers, 0 for regular attachments
- `filename`: Path contains `StickerCache` for stickers
- `mime_type`: Usually `image/heic`
- `emoji_image_content_identifier`: UUID for the sticker
- `emoji_image_short_description`: 
  - "Emoji" for standard stickers
  - Descriptive text for **Genmoji** (AI-generated emoji stickers)

### Animated Memoji

Animated memoji are stored as video files:

```sql
SELECT 
  m.ROWID,
  a.transfer_name,
  a.mime_type,
  a.total_bytes
FROM message m
INNER JOIN message_attachment_join maj ON m.ROWID = maj.message_id
INNER JOIN attachment a ON maj.attachment_id = a.ROWID
WHERE a.transfer_name LIKE '%EmojiMovie%';
```

**Characteristics:**
- `mime_type`: `video/quicktime`
- `transfer_name`: `EmojiMovie{number}.mov`
- `is_sticker`: 0 (not flagged as sticker)
- File size: 0.8 MB - 16 MB

### Message Effects

Special visual effects on messages:

```sql
SELECT 
  expressive_send_style_id,
  COUNT(*) as count
FROM message
WHERE expressive_send_style_id IS NOT NULL
GROUP BY expressive_send_style_id;
```

**Effect types:**
- `com.apple.MobileSMS.expressivesend.invisibleink`: Invisible ink
- `com.apple.MobileSMS.expressivesend.impact`: Slam
- `com.apple.MobileSMS.expressivesend.loud`: Loud
- `com.apple.MobileSMS.expressivesend.gentle`: Gentle
- `com.apple.messages.effect.CK*`: Screen effects (confetti, fireworks, lasers, etc.)

### iMessage Apps

Third-party app messages are identified by `balloon_bundle_id`:

```sql
SELECT 
  balloon_bundle_id,
  COUNT(*) as count
FROM message
WHERE balloon_bundle_id IS NOT NULL
GROUP BY balloon_bundle_id
ORDER BY count DESC;
```

**Common apps:**
- `com.apple.messages.URLBalloonProvider`: URL previews
- `...gamepigeon.ext`: GamePigeon
- `...imessagepoll.MessagesExtension`: Polls
- `...findmy.FindMyMessagesApp`: Find My location sharing
- `...PhotosMessagesApp`: Photos integration

---

## Displaying Conversations

### Get Complete Conversation Thread

```python
import sqlite3
import re
from datetime import datetime, timedelta

db_path = '~/Desktop/chat.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get messages from a specific contact
phone_number = '+18605979180'

cursor.execute("""
    SELECT
        m.ROWID,
        m.date,
        m.is_from_me,
        m.text,
        m.attributedBody
    FROM chat c
    INNER JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
    INNER JOIN message m ON cmj.message_id = m.ROWID
    WHERE c.chat_identifier = ?
        AND m.item_type = 0
    ORDER BY m.date ASC
    LIMIT 50
""", (phone_number,))

def apple_time_to_datetime(timestamp):
    apple_epoch = datetime(2001, 1, 1)
    return apple_epoch + timedelta(seconds=timestamp / 1000000000)

def extract_from_binary(attributed_body):
    # [Use function from "Decoding Binary Messages" section]
    pass

for rowid, date, is_from_me, text, attr_body in cursor.fetchall():
    content = text if text else extract_from_binary(attr_body)

    if content:
        timestamp = apple_time_to_datetime(date)
        sender = "YOU" if is_from_me else "THEM"
        time_str = timestamp.strftime('%H:%M:%S')

        print(f"[{time_str}] {sender}: {content}")

conn.close()
```

### Format as iMessage UI

```python
def format_as_imessage(messages, contact):
    """Format messages to look like iMessage UI"""

    print("╔" + "═" * 70 + "╗")
    print(f"║{contact.center(70)}║")
    print("╚" + "═" * 70 + "╝\n")

    for timestamp, is_from_me, content in messages:
        time_str = timestamp.strftime('%H:%M:%S')

        # Word wrap at 50 characters
        max_width = 50
        words = content.split()
        lines = []
        current_line = []
        current_length = 0

        for word in words:
            if current_length + len(word) + 1 <= max_width:
                current_line.append(word)
                current_length += len(word) + 1
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
                current_length = len(word)
        if current_line:
            lines.append(' '.join(current_line))

        if is_from_me:
            # Right-aligned (your messages)
            print("                     ┌" + "─" * 46 + "┐")
            for i, line in enumerate(lines):
                if i == len(lines) - 1:
                    print(f"                     │ {line:<44} │  {time_str}")
                else:
                    print(f"                     │ {line:<44} │")
            print("                     └" + "─" * 46 + "┘\n")
        else:
            # Left-aligned (their messages)
            print("┌" + "─" * 54 + "┐")
            for i, line in enumerate(lines):
                if i == len(lines) - 1:
                    print(f"│ {line:<52} │  {time_str}")
                else:
                    print(f"│ {line:<52} │")
            print("└" + "─" * 54 + "┘\n")
```

---

## Advanced Techniques

### Find Oldest/Newest Messages

```sql
-- Oldest message
SELECT
  ROWID,
  datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as timestamp,
  text
FROM message
WHERE item_type = 0
ORDER BY date ASC
LIMIT 1;

-- Newest message
SELECT
  ROWID,
  datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as timestamp,
  text
FROM message
WHERE item_type = 0
ORDER BY date DESC
LIMIT 1;
```

### Get Message Date Range

```sql
SELECT
  datetime(MIN(date)/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as oldest_date,
  datetime(MAX(date)/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as newest_date
FROM message;
```

### Contact Information

Contact names are NOT stored in the iMessage database. They are in a separate AddressBook database:

**Location:** `~/Library/Application Support/AddressBook/Sources/*/AddressBook-v22.abcddb`

**Join with phone numbers:**
```sql
-- Attach both databases
ATTACH DATABASE '/path/to/chat.db' AS imessage;
ATTACH DATABASE '/path/to/AddressBook-v22.abcddb' AS contacts;

-- Join handles with contact names
SELECT 
  h.id as phone_number,
  c.ZFIRSTNAME as first_name,
  c.ZLASTNAME as last_name
FROM imessage.handle h
LEFT JOIN contacts.ZABCDPHONENUMBER p ON (
  -- Normalize phone numbers by removing formatting
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(h.id, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '') 
  = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.ZFULLNUMBER, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')
)
LEFT JOIN contacts.ZABCDRECORD c ON p.ZOWNER = c.Z_PK
LIMIT 10;
```

### All Database Tables

Complete table listing:
- `message`: Main message content and metadata
- `chat`: Conversation information
- `handle`: Contact identifiers (phone/email)
- `attachment`: Media files
- `chat_message_join`: Links messages to chats
- `message_attachment_join`: Links messages to attachments
- `chat_handle_join`: Links chats to participants
- `deleted_messages`: Tracking deleted message GUIDs
- `sync_deleted_*`: CloudKit sync tracking
- `recoverable_message_part`: Edit history and unsent message parts
- `chat_recoverable_message_join`: Links for recoverable parts
- `message_processing_task`: Background processing queue
- `kvtable`: Key-value configuration store

### Get Messages by Year

```sql
SELECT
  strftime('%Y', datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch')) as year,
  COUNT(*) as count
FROM message
GROUP BY year
ORDER BY year;
```

### Search for Specific Text

**Important**: Most messages don't have `text` populated. For comprehensive search:

```sql
-- Search in text field (quick but incomplete)
SELECT
  m.ROWID,
  datetime(m.date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as timestamp,
  m.text,
  h.id as contact
FROM message m
LEFT JOIN handle h ON m.handle_id = h.ROWID
WHERE m.text LIKE '%search term%'
ORDER BY m.date DESC
LIMIT 20;
```

For complete search, you must decode `attributedBody` in application code.

### Get Attachment Statistics

```sql
SELECT
  mime_type,
  COUNT(*) as count,
  SUM(total_bytes) as total_size,
  SUM(CASE WHEN is_sticker = 1 THEN 1 ELSE 0 END) as stickers
FROM attachment
WHERE mime_type IS NOT NULL
GROUP BY mime_type
ORDER BY count DESC;
```

---

## Complete Example Script

Here's a complete Python script that puts it all together:

```python
#!/usr/bin/env python3
"""
iMessage Database Reader
Extracts and displays messages from Apple's chat.db
"""

import sqlite3
import re
from datetime import datetime, timedelta
import os

class iMessageReader:
    def __init__(self, db_path):
        self.db_path = os.path.expanduser(db_path)
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()

    def __del__(self):
        if hasattr(self, 'conn'):
            self.conn.close()

    @staticmethod
    def apple_time_to_datetime(timestamp):
        """Convert Apple epoch timestamp to datetime"""
        if timestamp is None:
            return None
        apple_epoch = datetime(2001, 1, 1)
        return apple_epoch + timedelta(seconds=timestamp / 1000000000)

    @staticmethod
    def clean_text(text):
        """Remove binary artifacts from text"""
        if not text:
            return None

        artifacts = [
            'streamtyped', 'NSAttributedString', 'NSObject', 'NSString',
            'NSDictionary', '__kIMMessagePartAttributeName', 'NSNumber',
            'NSValue', '__kIMBaseWritingDirectionAttributeName',
            'NSMutableAttributedString', 'NSMutableString'
        ]

        for artifact in artifacts:
            text = text.replace(artifact, '')

        text = re.sub(r'@\s*\+[A-Za-z0-9,.\-]*\s*', '', text)
        text = re.sub(r'\s+iI\s+[^\s]*\s+i\s+\*', '', text)
        text = re.sub(r'\s+iI\s+\*', '', text)
        text = re.sub(r'\s+', ' ', text).strip()

        return text if text else None

    @staticmethod
    def extract_from_binary(attributed_body):
        """Extract text from NSAttributedString binary format"""
        if not attributed_body:
            return None
        try:
            text = attributed_body.decode('utf-8', errors='ignore')
            cleaned = re.sub(r'[\x00-\x08\x0b-\x1f\x7f-\x9f]', ' ', text)
            return iMessageReader.clean_text(cleaned)
        except:
            return None

    def get_statistics(self):
        """Get database statistics"""
        stats = {}

        self.cursor.execute("SELECT COUNT(*) FROM message")
        stats['total_messages'] = self.cursor.fetchone()[0]

        self.cursor.execute("SELECT COUNT(*) FROM chat")
        stats['total_chats'] = self.cursor.fetchone()[0]

        self.cursor.execute("SELECT COUNT(*) FROM handle")
        stats['total_contacts'] = self.cursor.fetchone()[0]

        self.cursor.execute("SELECT COUNT(*) FROM attachment")
        stats['total_attachments'] = self.cursor.fetchone()[0]

        return stats

    def get_conversation(self, contact, limit=50):
        """Get messages from a specific contact"""
        self.cursor.execute("""
            SELECT
                m.ROWID,
                m.date,
                m.is_from_me,
                m.text,
                m.attributedBody
            FROM chat c
            INNER JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
            INNER JOIN message m ON cmj.message_id = m.ROWID
            WHERE c.chat_identifier = ?
                AND m.item_type = 0
            ORDER BY m.date DESC
            LIMIT ?
        """, (contact, limit))

        messages = []
        for rowid, date, is_from_me, text, attr_body in self.cursor.fetchall():
            content = text if text else self.extract_from_binary(attr_body)

            if content:
                timestamp = self.apple_time_to_datetime(date)
                messages.append((timestamp, is_from_me, content))

        return list(reversed(messages))

    def print_conversation(self, contact, limit=50):
        """Print conversation in iMessage-style format"""
        messages = self.get_conversation(contact, limit)

        print("╔" + "═" * 70 + "╗")
        print(f"║{contact.center(70)}║")
        print("╚" + "═" * 70 + "╝\n")

        for timestamp, is_from_me, content in messages:
            time_str = timestamp.strftime('%H:%M:%S')

            # Word wrap
            max_width = 50
            words = content.split()
            lines = []
            current_line = []
            current_length = 0

            for word in words:
                if current_length + len(word) + 1 <= max_width:
                    current_line.append(word)
                    current_length += len(word) + 1
                else:
                    if current_line:
                        lines.append(' '.join(current_line))
                    current_line = [word]
                    current_length = len(word)
            if current_line:
                lines.append(' '.join(current_line))

            if is_from_me:
                print("                     ┌" + "─" * 46 + "┐")
                for i, line in enumerate(lines):
                    if i == len(lines) - 1:
                        print(f"                     │ {line:<44} │  {time_str}")
                    else:
                        print(f"                     │ {line:<44} │")
                print("                     └" + "─" * 46 + "┘\n")
            else:
                print("┌" + "─" * 54 + "┐")
                for i, line in enumerate(lines):
                    if i == len(lines) - 1:
                        print(f"│ {line:<52} │  {time_str}")
                    else:
                        print(f"│ {line:<52} │")
                print("└" + "─" * 54 + "┘\n")

# Usage example
if __name__ == "__main__":
    reader = iMessageReader("~/Desktop/chat.db")

    # Get statistics
    stats = reader.get_statistics()
    print("Database Statistics:")
    print(f"  Total Messages: {stats['total_messages']:,}")
    print(f"  Total Chats: {stats['total_chats']:,}")
    print(f"  Total Contacts: {stats['total_contacts']:,}")
    print(f"  Total Attachments: {stats['total_attachments']:,}")
    print()

    # Display a conversation
    reader.print_conversation("+18605979180", limit=30)
```

---

## Tips and Tricks

### 1. Always Use Read-Only Mode

```bash
sqlite3 file:~/Desktop/chat.db?mode=ro
```

### 2. Export to CSV

```bash
sqlite3 ~/Desktop/chat.db << EOF
.headers on
.mode csv
.output messages.csv
SELECT
  datetime(date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as timestamp,
  text,
  is_from_me
FROM message
WHERE item_type = 0
LIMIT 1000;
.quit
EOF
```

### 3. Performance Optimization

- Use indexes: The database already has indexes on common query patterns
- Limit results with `LIMIT` clause
- Use `WHERE item_type = 0` to filter out system messages
- Query specific date ranges to reduce data processed

### 4. Common Pitfalls

- **Empty text field**: Don't assume `text` field always has content - use `attributedBody`
- **Timezone issues**: Apple timestamps are in UTC, convert to local time for display
- **Missing messages**: Check `item_type` - only `0` is regular messages
- **Group chats**: Messages appear in multiple chat_message_join entries

---

## Critical Best Practices

### Parsing Messages Correctly

**Always follow this order:**
1. Check `item_type = 0` (regular messages only)
2. Try `text` field first (fast but only 0.8% populated for iMessage)
3. Decode `attributedBody` if `text` is empty (99.2% of iMessages)
4. For edited messages: `text` is ALWAYS empty, use `attributedBody` only

### Common Pitfalls

1. **Assuming `text` field has content** ❌
   - 99.2% of iMessages require decoding `attributedBody`
   - Service type matters: iMessage vs SMS vs RCS

2. **Missing reactions** ❌
   - Reactions are separate messages with `associated_message_guid`
   - Check `item_type = 0` and `associated_message_guid IS NOT NULL`

3. **Ignoring edited messages** ❌
   - Check `date_edited` field
   - Original content is lost (only current version in `attributedBody`)

4. **Group chat confusion** ❌
   - Use `style = 43` for group chats, `45` for 1-on-1
   - Participants are in `chat_handle_join`, not in message senders

5. **Timezone issues** ❌
   - Apple timestamps are in UTC
   - Convert to local time for display

### Performance Tips

- **Always filter by `item_type = 0`** for regular messages
- **Use date ranges** to limit query scope
- **Index on `date` field** is already present
- **Query specific `handle_id`** for single-contact conversations
- **Avoid full table scans** of `attributedBody`

### Data Completeness

Messages may span:
- Multiple services (iMessage, SMS, RCS)
- Multiple devices (sync via iCloud)
- Years of history (database never fully purged)

Check date ranges before assuming completeness:
```sql
SELECT 
  datetime(MIN(date)/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as oldest,
  datetime(MAX(date)/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as newest,
  COUNT(*) as total_messages
FROM message
WHERE item_type = 0;
```

---

## Security & Privacy Notes

⚠️ **Important**: This database contains private conversations. Handle with care:

- Never share the database file
- Be careful when running scripts that export data
- Consider encrypting exported data
- Delete temporary files after analysis
- **Always use read-only mode**: `sqlite3 file:path/to/chat.db?mode=ro`

---

## Quick Reference

### Essential Fields Summary

**Message Table:**
- `text`: Plain text (empty for 99% of iMessages)
- `attributedBody`: Binary NSAttributedString (canonical source)
- `date`: Timestamp (Apple epoch nanoseconds)
- `date_edited`: Edit timestamp (iOS 16+)
- `date_retracted`: Unsend timestamp (iOS 16+)
- `is_from_me`: 1 = sent by you, 0 = received
- `handle_id`: Foreign key to sender
- `item_type`: 0 = regular message
- `reply_to_guid`: Parent message GUID for replies
- `associated_message_guid`: Original message for reactions
- `associated_message_type`: Reaction type (2000-2005, 3000-3005)
- `service`: iMessage, SMS, RCS
- `part_count`: Multi-part message count
- `cache_has_attachments`: Has media

**Chat Table:**
- `style`: 43 = group chat, 45 = 1-on-1
- `chat_identifier`: Phone/email or group ID
- `display_name`: Custom chat name
- `service_name`: iMessage, SMS, RCS

**Attachment Table:**
- `is_sticker`: 1 for stickers
- `filename`: Full path to media
- `mime_type`: File type
- `emoji_image_short_description`: Genmoji descriptions

### Date Conversion
```python
from datetime import datetime, timedelta
apple_epoch = datetime(2001, 1, 1)
readable = apple_epoch + timedelta(seconds=timestamp / 1_000_000_000)
```

---

## References

- Apple Core Data Documentation
- SQLite Documentation: https://www.sqlite.org/docs.html
- NSAttributedString Reference: https://developer.apple.com/documentation/foundation/nsattributedstring
- iOS 16 Message Editing: https://support.apple.com/en-us/HT212914

---

## License

This guide is provided for educational purposes. Respect privacy and use responsibly.

---

**Last Updated**: November 2025  
**Database Version**: iOS 16+ / macOS 15+
