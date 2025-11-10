#!/usr/bin/env python3
"""
Extract messages from top one-on-one conversations in the past 6 months
Creates separate files for each contact
"""

import sqlite3
import re
from datetime import datetime, timedelta
import os

# database paths
IMESSAGE_DB = os.path.expanduser('~/Library/Messages/chat.db')
OUTPUT_DIR = '/Users/connor/textreme/ml/data/recent_conversations'

# configuration
MONTHS_BACK = 6
TOP_N_CONTACTS = 20  # how many top contacts to extract

def apple_time_to_datetime(timestamp):
    """convert Apple epoch timestamp to datetime"""
    if timestamp is None or timestamp == 0:
        return None
    # Apple epoch starts at Jan 1, 2001
    apple_epoch = datetime(2001, 1, 1)
    return apple_epoch + timedelta(seconds=timestamp / 1000000000)

def datetime_to_apple_time(dt):
    """convert datetime to Apple epoch timestamp"""
    apple_epoch = datetime(2001, 1, 1)
    delta = dt - apple_epoch
    return int(delta.total_seconds() * 1000000000)

def clean_text(text):
    """remove Apple binary artifacts from extracted text"""
    if not text:
        return None
    
    # remove file transfer GUID references (multiple patterns)
    text = re.sub(r'__kIMFileTransferGUIDAttributeName\)[^"]*"[^"]*"', '', text)
    text = re.sub(r'iI\s+i\s+[&*]\s+\*\s+q\s+"__kIMFileTransferGUIDAttributeName\)[^"]*"?', '', text)
    text = re.sub(r'iI\s+i\s+[&*]\s+\*\s+q\s+"[^"]*"', '', text)
    text = re.sub(r'__kIMFileTransferGUIDAttributeName\)', '', text)
    
    # remove calendar event data and link metadata (bplist binary data)
    text = re.sub(r'__kIMCalendarEventAttributeName.*?(?:}|$)', '', text, flags=re.DOTALL)
    text = re.sub(r'__kIMLinkIsRichLinkAttributeName.*?DDScannerResult[^N]*N', '', text, flags=re.DOTALL)
    text = re.sub(r'__kIMLinkAttributeName.*?(?:NSURL|HttpURL).*?(?:\[[\da-f]+\])?bplist00.*?DDScannerResult[^N]*N', '', text, flags=re.DOTALL)
    text = re.sub(r'bplist00.*?DDScannerResult[^}]*}', '', text, flags=re.DOTALL)
    
    # remove common binary artifacts
    artifacts = [
        'streamtyped', 'NSAttributedString', 'NSObject', 'NSString',
        'NSDictionary', '__kIMMessagePartAttributeName', 'NSNumber',
        'NSValue', '__kIMBaseWritingDirectionAttributeName',
        'NSMutableAttributedString', 'NSMutableString', 'NSMutableData',
        'NSData', 'NSArray', 'NSMutableArray', '__kIMDataDetectedAttributeName',
        '__kIMFilenameAttributeName'
    ]
    
    for artifact in artifacts:
        text = text.replace(artifact, '')
    
    # remove encoding markers and technical strings
    text = re.sub(r'@\s*\+[A-Za-z0-9,.\-]*\s*', '', text)
    text = re.sub(r'\s+iI\s+[^\s]*\s+i\s+\*', '', text)
    text = re.sub(r'\s+iI\s+\*', '', text)
    text = re.sub(r'iI\s+i\s+[&*]\s+\*\s+q', '', text)  # binary markers
    text = re.sub(r'at_\d+_[A-F0-9-]+', '', text)  # attachment references
    
    # remove the object replacement character (often used for attachments)
    text = text.replace('\ufffc', '')
    
    # remove leading special characters from binary data (but preserve reactions)
    # don't remove if it's a reaction message
    if not text.startswith('<Reacted') and not text.startswith('Reacted'):
        text = re.sub(r'^[%+&*\':/@!#$<>]+\s*', '', text)
    text = re.sub(r'\s+[%+&*]\s+', ' ', text)
    
    # remove standalone "iI i" patterns
    text = re.sub(r'\s+iI\s+i\s+"[&*]\s+q\s*', '', text)
    text = re.sub(r'iI\s+i\s+"[&*]\s+q\s*', '', text)
    
    # clean up quotes and spaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    # if only special chars remain, return None
    if re.match(r'^[%+&*\'"]+$', text):
        return None
    
    return text if text else None

def extract_from_binary(attributed_body):
    """extract readable text from NSAttributedString binary format"""
    if not attributed_body:
        return None
    
    try:
        # try UTF-8 decoding with error handling
        text = attributed_body.decode('utf-8', errors='ignore')
        
        # remove control characters but keep newlines and tabs
        cleaned = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\x9f]', ' ', text)
        
        return clean_text(cleaned)
    except Exception as e:
        # fallback: try latin-1
        try:
            text = attributed_body.decode('latin-1', errors='ignore')
            cleaned = re.sub(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\x9f]', ' ', text)
            return clean_text(cleaned)
        except:
            return None

def get_contact_name(phone_number):
    """try to get contact name from AddressBook"""
    # try both AddressBook sources
    db_paths = [
        os.path.expanduser('~/Library/Application Support/AddressBook/Sources/5A6B384E-DC1B-4323-88D3-CF01362BD720/AddressBook-v22.abcddb'),
        os.path.expanduser('~/Library/Application Support/AddressBook/Sources/C8D965E7-7FAB-442C-8896-C2BAC8393B82/AddressBook-v22.abcddb')
    ]
    
    # normalize phone number for comparison
    normalized = re.sub(r'[^\d]', '', phone_number)
    
    for db_path in db_paths:
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT c.ZFIRSTNAME, c.ZLASTNAME, c.ZORGANIZATION
                FROM ZABCDPHONENUMBER p
                INNER JOIN ZABCDRECORD c ON p.ZOWNER = c.Z_PK
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.ZFULLNUMBER, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '') 
                  LIKE ?
            """, (f'%{normalized[-10:]}',))  # match last 10 digits
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                first, last, org = result
                name_parts = []
                if first:
                    name_parts.append(first)
                if last:
                    name_parts.append(last)
                if name_parts:
                    return ' '.join(name_parts)
                elif org:
                    return org
        except Exception as e:
            continue
    
    return phone_number

def sanitize_filename(name):
    """sanitize contact name for use as filename"""
    # remove invalid filename characters
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    # replace spaces with underscores
    name = name.replace(' ', '_')
    # limit length
    return name[:50]

def extract_conversation(conn, chat_id, chat_identifier, contact_name, cutoff_date):
    """extract messages from a specific conversation after cutoff date"""
    cursor = conn.cursor()
    
    # get all messages from this conversation after cutoff date
    cursor.execute("""
        SELECT
            m.ROWID,
            m.date,
            m.is_from_me,
            m.text,
            m.attributedBody,
            m.cache_has_attachments
        FROM chat c
        INNER JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
        INNER JOIN message m ON cmj.message_id = m.ROWID
        WHERE c.ROWID = ?
            AND m.item_type = 0  -- only regular messages
            AND m.date >= ?
        ORDER BY m.date ASC
    """, (chat_id, cutoff_date))
    
    messages = cursor.fetchall()
    
    if not messages:
        return 0
    
    # create output filename
    filename = f"{sanitize_filename(contact_name)}_{chat_identifier.replace('+', '').replace('@', '_at_')}.txt"
    filepath = os.path.join(OUTPUT_DIR, filename)
    
    # write messages to file
    processed = 0
    skipped = 0
    
    with open(filepath, 'w', encoding='utf-8') as f:
        # write header
        f.write(f"=" * 80 + "\n")
        f.write(f"RECENT MESSAGE HISTORY (Past {MONTHS_BACK} Months)\n")
        f.write(f"Contact: {contact_name} ({chat_identifier})\n")
        f.write(f"Total Messages: {len(messages):,}\n")
        f.write(f"Exported: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"=" * 80 + "\n\n")
        
        for rowid, date, is_from_me, text, attr_body, has_attachments in messages:
            # get message content
            content = text if text else extract_from_binary(attr_body)
            
            # if content is just object replacement character, treat as attachment
            if content and content.strip() == '￼':
                content = "[attachment]"
            
            # skip if no content and no attachments
            if not content:
                if has_attachments:
                    content = "[attachment]"
                else:
                    skipped += 1
                    continue
            
            # get timestamp
            timestamp = apple_time_to_datetime(date)
            time_str = timestamp.strftime('%Y-%m-%d %H:%M:%S') if timestamp else 'Unknown time'
            
            # determine sender
            sender = "ME" if is_from_me else contact_name.split()[0] if ' ' in contact_name else contact_name
            
            # write message
            f.write(f"[{time_str}] {sender}: {content}\n")
            processed += 1
    
    return processed

def main():
    print("Opening iMessage database...")
    conn = sqlite3.connect(IMESSAGE_DB)
    cursor = conn.cursor()
    
    # calculate cutoff date (6 months ago)
    cutoff_datetime = datetime.now() - timedelta(days=MONTHS_BACK * 30)
    cutoff_timestamp = datetime_to_apple_time(cutoff_datetime)
    
    print(f"Finding top {TOP_N_CONTACTS} most active one-on-one conversations since {cutoff_datetime.strftime('%Y-%m-%d')}...")
    
    # find most active 1-on-1 chats in the past 6 months
    cursor.execute("""
        SELECT 
            c.ROWID as chat_id,
            c.chat_identifier,
            COUNT(cmj.message_id) as message_count
        FROM chat c
        LEFT JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
        LEFT JOIN message m ON cmj.message_id = m.ROWID
        WHERE c.style = 45  -- 1-on-1 chats
            AND c.chat_identifier IS NOT NULL
            AND c.chat_identifier != ''
            AND m.date >= ?
            AND m.item_type = 0  -- regular messages only
        GROUP BY c.ROWID
        HAVING message_count > 0
        ORDER BY message_count DESC
        LIMIT ?
    """, (cutoff_timestamp, TOP_N_CONTACTS))
    
    top_contacts = cursor.fetchall()
    
    if not top_contacts:
        print("No one-on-one conversations found in the past 6 months!")
        conn.close()
        return
    
    print(f"\nFound {len(top_contacts)} active contacts:")
    for i, (chat_id, chat_identifier, msg_count) in enumerate(top_contacts, 1):
        contact_name = get_contact_name(chat_identifier)
        print(f"  {i}. {contact_name} ({chat_identifier}): {msg_count:,} messages")
    
    # create output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"\nExtracting messages to: {OUTPUT_DIR}")
    print("=" * 80)
    
    # extract messages for each contact
    total_processed = 0
    for i, (chat_id, chat_identifier, msg_count) in enumerate(top_contacts, 1):
        contact_name = get_contact_name(chat_identifier)
        print(f"\n[{i}/{len(top_contacts)}] Processing: {contact_name}")
        print(f"  Expected messages: {msg_count:,}")
        
        processed = extract_conversation(conn, chat_id, chat_identifier, contact_name, cutoff_timestamp)
        total_processed += processed
        
        print(f"  ✓ Extracted: {processed:,} messages")
    
    conn.close()
    
    print("\n" + "=" * 80)
    print(f"✓ Extraction complete!")
    print(f"  Total contacts: {len(top_contacts)}")
    print(f"  Total messages: {total_processed:,}")
    print(f"  Output directory: {OUTPUT_DIR}")
    print(f"\nFiles created:")
    for filename in sorted(os.listdir(OUTPUT_DIR)):
        if filename.endswith('.txt'):
            filepath = os.path.join(OUTPUT_DIR, filename)
            size = os.path.getsize(filepath)
            print(f"  - {filename} ({size:,} bytes)")

if __name__ == "__main__":
    main()

