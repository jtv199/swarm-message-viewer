#!/usr/bin/env python3
"""Validate generic swarm JSON/JSONL and write the browser's static data file."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import re


def convert(data):
    if not isinstance(data, dict):
        raise ValueError('JSON input must be an object with agents, rooms, and messages arrays')
    def entities(key):
        rows = data.get(key)
        if not isinstance(rows, list) or not rows:
            raise ValueError(f'{key} must be a nonempty array')
        result = []
        for index, row in enumerate(rows):
            if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not re.fullmatch(r'[A-Za-z0-9_.:-]+', row['id']):
                raise ValueError(f'{key}[{index}].id must use letters, digits, underscore, dot, colon or hyphen')
            if not isinstance(row.get('name'), str) or not row['name'].strip():
                raise ValueError(f'{key}[{index}].name must be a nonempty string')
            if row.get('speaker_type', 'agent') not in ('agent', 'human'):
                raise ValueError(f'{key}[{index}].speaker_type must be agent or human')
            result.append({'id': row['id'], 'name': row['name'], 'speaker_type': row.get('speaker_type', 'agent')})
        if len({r['id'] for r in result}) != len(result):
            raise ValueError(f'{key} contains duplicate IDs')
        return result
    agents, rooms = entities('agents'), entities('rooms')
    agent_ids, room_ids = {a['id'] for a in agents}, {r['id'] for r in rooms}
    if agent_ids & room_ids:
        raise ValueError('Agent and room IDs must be disjoint')
    roles = {a['id']: a['speaker_type'] for a in agents}
    rows = data.get('messages')
    if not isinstance(rows, list) or not rows:
        raise ValueError('messages must be a nonempty array')
    messages, seen = [], set()
    for index, row in enumerate(rows):
        where = f'messages[{index}]'
        if not isinstance(row, dict):
            raise ValueError(f'{where} must be an object')
        mid = row.get('id')
        if not isinstance(mid, str) or not mid.strip() or mid in seen:
            raise ValueError(f'{where}.id must be a unique nonempty string')
        seen.add(mid)
        sender, room, recipients = row.get('sender'), row.get('room'), row.get('recipients')
        if not isinstance(sender, str) or sender not in agent_ids:
            raise ValueError(f'{where}.sender is not a declared agent')
        if not isinstance(room, str) or room not in room_ids:
            raise ValueError(f'{where}.room is not a declared room')
        if not isinstance(recipients, list) or any(not isinstance(r, str) or r not in agent_ids for r in recipients):
            raise ValueError(f'{where}.recipients must be an array of declared agent IDs (use [] for a room post)')
        if not isinstance(row.get('text'), str):
            raise ValueError(f'{where}.text must be a string')
        timestamp = row.get('timestamp')
        if not isinstance(timestamp, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})', timestamp):
            raise ValueError(f'{where}.timestamp must be ISO 8601 with seconds and an explicit timezone')
        try:
            time = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).astimezone(timezone.utc)
        except ValueError as exc:
            raise ValueError(f'{where}.timestamp is invalid: {exc}') from exc
        messages.append({'id': mid, 'created_at': time.isoformat(timespec='milliseconds').replace('T', ' ').replace('+00:00', ''), 'agent_speaker_id': sender, 'room_id': room, 'recipient_agent_ids': list(dict.fromkeys(recipients)), 'content': row['text'], 'address_matches': [], 'speaker_type': roles[sender]})
    messages.sort(key=lambda m: m['created_at'])
    return {'agents': agents, 'rooms': rooms, 'messages': messages}


def load(path, agents=None, rooms=None):
    if path.suffix.lower() == '.jsonl':
        if agents is None or rooms is None:
            raise ValueError('JSONL requires --agents agents.json and --rooms rooms.json')
        rows = []
        for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise ValueError(f'JSONL line {number}: {exc.msg}') from exc
        return {'agents': json.loads(agents.read_text(encoding='utf-8')), 'rooms': json.loads(rooms.read_text(encoding='utf-8')), 'messages': rows}
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--agents', type=Path)
    parser.add_argument('--rooms', type=Path)
    parser.add_argument('--output', type=Path, default=Path('data.js'))
    args = parser.parse_args()
    try:
        fixture = convert(load(args.input, args.agents, args.rooms))
        # JSON serialization avoids injecting executable text from message content.
        payload = 'window.SWARM_DATA = ' + json.dumps(fixture, ensure_ascii=True) + ';\n'
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding='utf-8')
    except (ValueError, OSError) as exc:
        print(f'Conversion failed: {exc}', file=sys.stderr)
        return 1
    print(f'Wrote {len(fixture["messages"])} messages to {args.output}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
