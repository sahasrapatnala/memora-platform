import unittest
from synchronization import assign_speaker
class SpeakerRules(unittest.TestCase):
    def test_reuse_voice_label(self):
        turns=[{'start':0,'end':2,'speaker':'Speaker 1'},{'start':3,'end':5,'speaker':'Speaker 2'},{'start':6,'end':8,'speaker':'Speaker 1'}]
        self.assertEqual(assign_speaker(6,8,turns),'Speaker 1')
    def test_uncertain_is_unknown(self):
        self.assertEqual(assign_speaker(0,10,[{'start':0,'end':1,'speaker':'Speaker 1'}]),'Unknown')
