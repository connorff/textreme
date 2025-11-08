# iMessage Database Exploration Guide

A comprehensive guide to reading, querying, and decoding Apple's iMessage database (`chat.db`).

---

## Table of Contents

1. [Database Overview](#database-overview)
2. [Understanding the Schema](#understanding-the-schema)
3. [Basic Queries](#basic-queries)
4. [Decoding Binary Messages](#decoding-binary-messages)
5. [Date Format Conversion](#date-format-conversion)
6. [Displaying Conversations](#displaying-conversations)
7. [Advanced Techniques](#advanced-techniques)

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

### Get Reactions/Tapbacks

```sql
-- Reactions are stored with associated_message_type codes
-- 2000 = Love (heart)
-- 2001 = Like (thumbs up)
-- 2002 = Dislike (thumbs down)
-- 2003 = Laugh (haha)
-- 2004 = Emphasize (exclamation marks)
-- 2005 = Question (question mark)
-- 2006 = Custom emoji reaction

SELECT
  associated_message_emoji,
  associated_message_type,
  COUNT(*) as count
FROM message
WHERE associated_message_guid IS NOT NULL
GROUP BY associated_message_emoji, associated_message_type
ORDER BY count DESC;
```

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

```sql
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

### Get Group Chat Participants

```sql
SELECT
  c.display_name as chat_name,
  h.id as participant
FROM chat c
INNER JOIN chat_handle_join chj ON c.ROWID = chj.chat_id
INNER JOIN handle h ON chj.handle_id = h.ROWID
WHERE c.ROWID = ?  -- Replace with chat ROWID
ORDER BY h.id;
```

### Get Attachment Statistics

```sql
SELECT
  mime_type,
  COUNT(*) as count
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

## Security & Privacy Notes

⚠️ **Important**: This database contains private conversations. Handle with care:

- Never share the database file
- Be careful when running scripts that export data
- Consider encrypting exported data
- Delete temporary files after analysis

---

## References

- Apple Core Data Documentation
- SQLite Documentation: https://www.sqlite.org/docs.html
- NSAttributedString Reference: https://developer.apple.com/documentation/foundation/nsattributedstring

---

## License

This guide is provided for educational purposes. Respect privacy and use responsibly.

---

**Last Updated**: November 2025
