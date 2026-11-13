def assign_speaker(start, end, turns):
    overlaps = [(max(0, min(end, t['end']) - max(start, t['start'])), t['speaker']) for t in turns]
    best = max(overlaps, default=(0, 'Unknown'))
    return best[1] if end > start and best[0] / (end - start) >= .5 else 'Unknown'