#!/usr/bin/env python3
"""
Test script for the snapshot pipeline
"""
import json
from pathlib import Path
from pipeline import MemoryPipeline

def main():
    """Run a small test of the snapshot pipeline"""
    
    # Initialize pipeline
    print("Initializing pipeline...")
    pipeline = MemoryPipeline()
    
    # Run snapshot pipeline on top 2 contacts (for quick testing)
    output_file = "./test_snapshots.json"
    print(f"\nRunning snapshot pipeline (top 2 contacts for testing)...")
    print(f"Output will be saved to: {output_file}")
    
    pipeline.run_snapshot_pipeline(
        output_file=output_file,
        top_n=2  # Just 2 contacts for testing
    )
    
    # Load and display summary
    print("\n" + "="*70)
    print("RESULTS SUMMARY")
    print("="*70)
    
    with open(output_file, 'r') as f:
        data = json.load(f)
    
    for contact in data:
        print(f"\nContact: {contact['contact_name']}")
        print(f"  Total messages (last 6 months): {contact['metadata']['total_messages_last_6_months']}")
        print(f"  Number of weekly snapshots: {len(contact['weekly_snapshots'])}")
        
        # Show first snapshot
        first_week = sorted(contact['weekly_snapshots'].keys())[0]
        first_snapshot = contact['weekly_snapshots'][first_week]
        print(f"\n  First snapshot (week of {first_week}):")
        print(f"    - Lookback range: {first_snapshot['lookback_range']['start']} to {first_snapshot['lookback_range']['end']}")
        print(f"    - Messages in window: {first_snapshot['message_count']}")
        print(f"    - Weekly summaries: {len(first_snapshot['weekly_summaries'])}")
        print(f"    - Overall summary preview: {first_snapshot['overall_summary'][:150]}...")
    
    print("\n" + "="*70)
    print(f"✅ Test complete! Full output saved to: {output_file}")
    print("="*70)

if __name__ == "__main__":
    main()

