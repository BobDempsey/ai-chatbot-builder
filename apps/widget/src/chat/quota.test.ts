/**
 * The allowance hint counts over the same window the edge rule uses, says
 * nothing until enough of the allowance is gone, and treats a refusal as the
 * end of it whatever the count said.
 */
import { MAX_QUESTIONS_PER_WINDOW, RATE_WINDOW_MS, WARN_AFTER_QUESTIONS } from '@acb/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowanceNotice, clearQuota, markSpent, questionsLeft, recordQuestion } from './quota';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  clearQuota();
});

describe('counting questions', () => {
  it('counts down from the shared limit', () => {
    expect(questionsLeft()).toBe(MAX_QUESTIONS_PER_WINDOW);
    recordQuestion();
    recordQuestion();
    expect(questionsLeft()).toBe(MAX_QUESTIONS_PER_WINDOW - 2);
  });

  it('lets questions age out of the window', () => {
    const start = 1_000_000;
    recordQuestion(start);
    expect(questionsLeft(start)).toBe(MAX_QUESTIONS_PER_WINDOW - 1);
    expect(questionsLeft(start + RATE_WINDOW_MS + 1)).toBe(MAX_QUESTIONS_PER_WINDOW);
  });

  it('treats a refusal as the whole allowance spent', () => {
    recordQuestion();
    markSpent();
    expect(questionsLeft()).toBe(0);
  });

  it('keeps counting when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is disabled');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is disabled');
    });
    recordQuestion();
    expect(questionsLeft()).toBe(MAX_QUESTIONS_PER_WINDOW - 1);
  });
});

describe('what the panel says about it', () => {
  it('says nothing while the allowance is barely touched', () => {
    expect(allowanceNotice(MAX_QUESTIONS_PER_WINDOW)).toBeNull();
    expect(allowanceNotice(MAX_QUESTIONS_PER_WINDOW - WARN_AFTER_QUESTIONS + 1)).toBeNull();
  });

  it('shows the remaining count once enough is used', () => {
    expect(allowanceNotice(MAX_QUESTIONS_PER_WINDOW - WARN_AFTER_QUESTIONS)).toBe(
      `${MAX_QUESTIONS_PER_WINDOW - WARN_AFTER_QUESTIONS} questions remaining.`,
    );
    expect(allowanceNotice(1)).toBe('1 question remaining.');
  });

  it('says to come back later at zero', () => {
    expect(allowanceNotice(0)).toBe('You have used all your questions for now. Try again in a few minutes.');
  });
});
