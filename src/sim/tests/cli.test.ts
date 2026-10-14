import { describe, expect, it } from 'vitest';
import { runSim } from '../run.js';
import { formatResults, HELP, parseArgs, runCli } from '../cli.js';

describe('runSim', () => {
  it('plays one heuristic game and returns scores plus a replay', async () => {
    const result = await runSim({ count: 3, seed: 42 });
    expect(result.games).toHaveLength(1);
    expect(result.games[0]!.completed).toBe(true);
    expect(result.games[0]!.scores).toHaveLength(3);
    expect(result.games[0]!.winnerIds.length).toBeGreaterThan(0);
    expect(result.replay).not.toBeNull();
    expect(result.replay!.snapshots.length).toBeGreaterThan(1);
  });

  it('plays multiple games with distinct seeds', async () => {
    const result = await runSim({ count: 3, seed: 10, games: 3 });
    expect(result.games.map((g) => g.seed)).toEqual([10, 11, 12]);
  });

  it('is deterministic for a given seed', async () => {
    const a = await runSim({ seed: 7, count: 3 });
    const b = await runSim({ seed: 7, count: 3 });
    expect(a.games[0]!.actions).toBe(b.games[0]!.actions);
    expect(a.games[0]!.scores).toEqual(b.games[0]!.scores);
  });

  it('"pi" mode drives the async agent loop and still finishes', async () => {
    const result = await runSim({ seed: 5, count: 3, mode: 'pi' });
    expect(result.games[0]!.completed).toBe(true);
    expect(result.replay!.snapshots.length).toBe(result.games[0]!.actions + 1);
  });

  it('respects maxTurns, reporting an unfinished game with no scores', async () => {
    const result = await runSim({ count: 3, maxTurns: 2 });
    expect(result.games[0]!.completed).toBe(false);
    expect(result.games[0]!.scores).toEqual([]);
    expect(result.replay!.completed).toBe(false);
  });

  it('deals at N above the legacy 5-seat table', async () => {
    const result = await runSim({ count: 12, maxTurns: 200, games: 1 });
    expect(result.games[0]!.actions).toBeGreaterThan(0);
  });
});

describe('CLI parsing', () => {
  it('defaults to a heuristic 3-seat game', () => {
    expect(parseArgs([])).toEqual({ count: 3, seed: 1, games: 1, agents: 'heuristic' });
  });

  it('parses every flag', () => {
    expect(
      parseArgs([
        '--count',
        '10',
        '--seed',
        '9',
        '--games',
        '2',
        '--agents',
        'pi',
        '--emit-replay',
        'r.json',
        '--max-turns',
        '5',
      ]),
    ).toEqual({ count: 10, seed: 9, games: 2, agents: 'pi', emitReplay: 'r.json', maxTurns: 5 });
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['--nope'])).toThrow('Unknown argument');
  });

  it('rejects a non-numeric value', () => {
    expect(() => parseArgs(['--count', 'abc'])).toThrow('non-negative integer');
  });

  it('rejects a missing value', () => {
    expect(() => parseArgs(['--count'])).toThrow('needs a value');
  });

  it('rejects an unknown agent mode', () => {
    expect(() => parseArgs(['--agents', 'gpt'])).toThrow('heuristic');
  });

  it('rejects --emit-replay without a path', () => {
    expect(() => parseArgs(['--emit-replay'])).toThrow('needs a file path');
  });

  it('exposes help text', () => {
    expect(HELP).toContain('--agents');
    expect(HELP).toContain('--emit-replay');
  });
});

describe('CLI output', () => {
  it('formats a finished game with winners', async () => {
    const result = await runCli({ count: 3, seed: 1, games: 1, agents: 'heuristic' });
    const text = formatResults(result);
    expect(text).toContain('ended');
    expect(text).toContain('winner');
  });

  it('formats an unfinished game with a placeholder', async () => {
    const result = await runCli({ count: 3, seed: 1, games: 1, agents: 'heuristic', maxTurns: 1 });
    const text = formatResults(result);
    expect(text).toContain('unfinished');
    expect(text).toContain('no result');
  });
});
