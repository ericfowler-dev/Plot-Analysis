#!/usr/bin/env python3
"""
BPLT to CSV Converter - Command Line Interface
Converts ECI Binary Plot Data files (.bplt) to CSV format.
"""
import sys
import os

# Add the current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bplt_reader_core import convert_bplt_to_csv


def main():
    if len(sys.argv) < 3:
        print("Usage: python bplt_converter.py <input.bplt> <output.csv>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    try:
        convert_bplt_to_csv(input_path, output_path)
        print(f"Successfully converted {input_path} to {output_path}")
        sys.exit(0)
    except Exception as e:
        print(f"Error converting file: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
