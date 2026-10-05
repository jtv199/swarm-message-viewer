import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('convert', ROOT / 'scripts/convert.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ConversionTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / 'examples/swarm.json').read_text())

    def test_normalizes_offset_sorts_and_deduplicates(self):
        self.data['messages'][0]['timestamp'] = '2026-01-01T21:00:00+11:00'
        self.data['messages'][1]['recipients'] = ['builder', 'builder']
        result = module.convert(self.data)
        self.assertEqual(result['messages'][-1]['id'], 'm1')
        self.assertEqual(result['messages'][-1]['created_at'], '2026-01-01 10:00:00.000')
        self.assertEqual(result['messages'][0]['recipient_agent_ids'], ['builder'])

    def test_invalid_records(self):
        for field, value in [('sender', 'missing'), ('room', 'missing'), ('recipients', ['missing']), ('recipients', None), ('timestamp', '2026-01-01T09:00:00'), ('timestamp', '2026-13-01T09:00:00Z'), ('text', None), ('id', '')]:
            with self.subTest(field=field, value=value):
                data = copy.deepcopy(self.data)
                data['messages'][0][field] = value
                with self.assertRaises(ValueError):
                    module.convert(data)

    def test_duplicate_and_overlapping_ids(self):
        self.data['messages'][1]['id'] = 'm1'
        with self.assertRaises(ValueError):
            module.convert(self.data)
        self.setUp()
        self.data['rooms'][0]['id'] = 'planner'
        with self.assertRaises(ValueError):
            module.convert(self.data)

    def test_empty_messages_and_pair_delimiter(self):
        self.data['messages'] = []
        with self.assertRaises(ValueError):
            module.convert(self.data)
        self.setUp()
        self.data['agents'][0]['id'] = 'a|b'
        with self.assertRaises(ValueError):
            module.convert(self.data)

    def test_cli_invalid_input_preserves_output(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            source, output = folder / 'broken.json', folder / 'data.js'
            source.write_text('{"agents": []}')
            output.write_text('existing output')
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/convert.py'), str(source), '--output', str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('Conversion failed:', result.stderr)
            self.assertEqual(output.read_text(), 'existing output')

    def test_jsonl_and_line_errors(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            agents, rooms, records = folder / 'agents.json', folder / 'rooms.json', folder / 'messages.jsonl'
            agents.write_text(json.dumps(self.data['agents']))
            rooms.write_text(json.dumps(self.data['rooms']))
            records.write_text('\n'.join(json.dumps(m) for m in self.data['messages']))
            self.assertEqual(len(module.convert(module.load(records, agents, rooms))['messages']), 9)
            records.write_text('{}\ninvalid')
            with self.assertRaisesRegex(ValueError, 'line 2'):
                module.load(records, agents, rooms)


if __name__ == '__main__':
    unittest.main()
