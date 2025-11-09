#!/usr/bin/env python3
"""
Orchestrate training data extraction from multiple contacts.

Commands:
  config  - Discover contacts and generate config.json
  extract - Extract training pairs for all selected contacts
"""

import sqlite3
import json
import os
import glob
import argparse
import tempfile
from datetime import datetime, timedelta
from typing import List, Dict, Optional

from extract_training_pairs import extract_training_pairs


# Constants
CHAT_DB_PATH = os.path.expanduser('~/Library/Messages/chat.db')
ADDRESSBOOK_PATTERN = os.path.expanduser('~/Library/Application Support/AddressBook/Sources/*/AddressBook-v22.abcddb')
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(SCRIPT_DIR, 'config.json')
OUTPUT_FILE = os.path.join(SCRIPT_DIR, 'dataset.jsonl')
MIN_MESSAGES = 1000
YEARS_BACK = 2


def normalize_phone(phone: str) -> str:
    """Normalize phone number by removing formatting characters"""
    if not phone:
        return ""
    return phone.replace('+', '').replace('-', '').replace(' ', '').replace('(', '').replace(')', '')


def find_addressbook_dbs() -> List[str]:
    """Find all AddressBook databases using glob pattern
    
    Returns:
        List of paths to AddressBook databases (may be multiple)
    """
    matches = glob.glob(ADDRESSBOOK_PATTERN)
    return matches if matches else []


def get_contact_name(addressbook_paths: List[str], phone_number: str) -> Optional[str]:
    """Get contact name from AddressBook databases
    
    Args:
        addressbook_paths: List of paths to AddressBook databases to check
        phone_number: Phone number to look up (e.g., '+15152235896')
        
    Returns:
        Contact name if found, None otherwise
    """
    if not addressbook_paths:
        return None
    
    # normalize phone for matching (remove all formatting and country code prefix)
    normalized = normalize_phone(phone_number)
    
    for addressbook_path in addressbook_paths:
        if not os.path.exists(addressbook_path):
            continue
        
        try:
            conn = sqlite3.connect(addressbook_path)
            cursor = conn.cursor()
            
            # query for contact name using proper phone matching
            # match if the normalized chat phone ends with the normalized addressbook phone
            # and the addressbook phone is at least 10 digits (to avoid false matches)
            cursor.execute("""
                SELECT c.ZFIRSTNAME, c.ZLASTNAME
                FROM ZABCDPHONENUMBER p
                JOIN ZABCDRECORD c ON p.ZOWNER = c.Z_PK
                WHERE ? LIKE '%' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.ZFULLNUMBER, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')
                  AND LENGTH(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.ZFULLNUMBER, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')) >= 10
                LIMIT 1
            """, (normalized,))
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                first_name, last_name = result
                # handle NULL values
                first_name = first_name or ""
                last_name = last_name or ""
                full_name = f"{first_name} {last_name}".strip()
                return full_name if full_name else None
        
        except Exception as e:
            print(f"Warning: Could not query AddressBook {addressbook_path} for {phone_number}: {e}")
            continue
    
    return None


def cmd_config():
    """Generate config.json with all eligible contacts"""
    print("Discovering contacts...")
    print(f"Database: {CHAT_DB_PATH}")
    print(f"Minimum messages: {MIN_MESSAGES}")
    print(f"Time range: Last {YEARS_BACK} years")
    print(f"Service filter: iMessage only")
    print()
    
    # connect to chat database
    conn = sqlite3.connect(CHAT_DB_PATH)
    cursor = conn.cursor()
    
    # calculate date threshold
    now = datetime.now()
    threshold_date = now - timedelta(days=YEARS_BACK * 365)
    apple_epoch = datetime(2001, 1, 1)
    threshold_timestamp = int((threshold_date - apple_epoch).total_seconds() * 1_000_000_000)
    
    # find all 1:1 iMessage chats with enough messages
    # filter for service_name = 'iMessage' to exclude SMS/RCS
    cursor.execute("""
        SELECT 
            c.ROWID,
            c.chat_identifier,
            COUNT(m.ROWID) as message_count
        FROM chat c
        INNER JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
        INNER JOIN message m ON cmj.message_id = m.ROWID
        WHERE c.style = 45 
          AND c.service_name = 'iMessage'
          AND m.item_type = 0
          AND m.date >= ?
        GROUP BY c.ROWID
        HAVING message_count >= ?
        ORDER BY message_count DESC
    """, (threshold_timestamp, MIN_MESSAGES))
    
    rows = cursor.fetchall()
    conn.close()
    
    print(f"Found {len(rows)} eligible iMessage contacts")
    print()
    
    # find all addressbook databases
    addressbook_paths = find_addressbook_dbs()
    if addressbook_paths:
        print(f"Found {len(addressbook_paths)} AddressBook database(s):")
        for path in addressbook_paths:
            print(f"  - {path}")
    else:
        print("Warning: Could not find AddressBook databases")
        print("Contact names will default to identifiers")
    print()
    
    # build config entries
    contacts = []
    for chat_id, identifier, message_count in rows:
        # try to get contact name from all addressbook databases
        name = get_contact_name(addressbook_paths, identifier) if addressbook_paths else None
        if not name:
            name = identifier
        
        contact = {
            "name": name,
            "identifier": identifier,
            "messages": message_count,
            "include": True
        }
        contacts.append(contact)
        print(f"  {name}: {message_count} messages")
    
    # write config file
    with open(CONFIG_FILE, 'w') as f:
        json.dump(contacts, f, indent=2)
    
    print()
    print("=" * 60)
    print("CONFIG GENERATION COMPLETE")
    print("=" * 60)
    print(f"Total contacts: {len(contacts)}")
    print(f"Config file: {CONFIG_FILE}")
    print()
    print("Edit config.json to set 'include: false' for any contacts")
    print("you want to exclude from training data extraction.")
    print()


def cmd_extract():
    """Extract training pairs for all selected contacts"""
    print("Extracting training data for selected contacts...")
    print()
    
    # read config file
    if not os.path.exists(CONFIG_FILE):
        print(f"ERROR: Config file not found: {CONFIG_FILE}")
        print("Run 'python orchestrate.py config' first")
        return
    
    with open(CONFIG_FILE, 'r') as f:
        contacts = json.load(f)
    
    # filter to included contacts
    included = [c for c in contacts if c.get('include', True)]
    
    if not included:
        print("ERROR: No contacts selected for extraction")
        print("Edit config.json and set 'include: true' for at least one contact")
        return
    
    print(f"Processing {len(included)} contacts:")
    for contact in included:
        print(f"  - {contact['name']}")
    print()
    
    # extract training pairs for each contact
    all_examples = []
    total_written = 0
    
    for i, contact in enumerate(included, 1):
        name = contact['name']
        identifier = contact['identifier']
        
        print(f"[{i}/{len(included)}] Extracting: {name}")
        
        # create temp file for this contact
        with tempfile.NamedTemporaryFile(mode='w', suffix='.jsonl', delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            # extract training pairs (without timestamps)
            count = extract_training_pairs(
                target_phone=identifier,
                output_file=tmp_path,
                years_back=YEARS_BACK,
                include_timestamps=False,
                verbose=False,
                contact_name=name
            )
            
            # read examples from temp file
            if count > 0:
                with open(tmp_path, 'r') as f:
                    for line in f:
                        all_examples.append(line.strip())
                total_written += count
                print(f"  ✓ Extracted {count} examples")
            else:
                print(f"  ✗ No examples extracted")
        finally:
            # clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        
        print()
    
    # write combined dataset
    print(f"Writing combined dataset to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w') as f:
        for example in all_examples:
            f.write(example + '\n')
    
    print()
    print("=" * 60)
    print("EXTRACTION COMPLETE")
    print("=" * 60)
    print(f"Contacts processed: {len(included)}")
    print(f"Total examples: {total_written}")
    print(f"Output file: {OUTPUT_FILE}")
    print()


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description='Orchestrate training data extraction from multiple contacts',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to run')
    subparsers.required = True
    
    # config command
    parser_config = subparsers.add_parser(
        'config',
        help='Discover contacts and generate config.json'
    )
    
    # extract command
    parser_extract = subparsers.add_parser(
        'extract',
        help='Extract training pairs for all selected contacts'
    )
    
    args = parser.parse_args()
    
    if args.command == 'config':
        cmd_config()
    elif args.command == 'extract':
        cmd_extract()


if __name__ == '__main__':
    main()

