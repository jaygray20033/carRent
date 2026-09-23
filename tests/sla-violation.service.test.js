// tests/sla-violation.service.test.js — ENT-Day 3 unit tests
import {
  evaluateTerminationRisk,
  formatViolationRate,
} from '../src/services/slaReport.service.js';

describe('sla-violation.service (pure helpers)', () => {
  test('CRITICAL count = 0 → risk=false, warning=false', () => {
    const r = evaluateTerminationRisk(0);
    expect(r.contractTerminationRisk).toBe(false);
    expect(r.warningFlag).toBe(false);
    expect(r.warningMessage).toBeNull();
  });

  test('CRITICAL count = 1 → risk=false, warning=true', () => {
    const r = evaluateTerminationRisk(1);
    expect(r.contractTerminationRisk).toBe(false);
    expect(r.warningFlag).toBe(true);
    expect(r.warningMessage).toMatch(/1 lần/);
  });

  test('CRITICAL count = 2 → risk=true → auto-alert threshold', () => {
    const r = evaluateTerminationRisk(2);
    expect(r.contractTerminationRisk).toBe(true);
    expect(r.warningFlag).toBe(true);
    expect(r.warningMessage).toMatch(/chấm dứt/);
  });

  test('violationRate = (confirmed / totalTrips) × 100 — 1 decimal', () => {
    expect(formatViolationRate(3, 45)).toBe('6.7%');
    expect(formatViolationRate(0, 10)).toBe('0.0%');
    expect(formatViolationRate(1, 0)).toBe('0.0%');
    expect(formatViolationRate(1, 3)).toBe('33.3%');
  });
});
