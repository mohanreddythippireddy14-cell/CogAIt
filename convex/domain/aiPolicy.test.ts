import { describe, it, expect } from 'vitest';
import { validateAiResponse, isValidHelpLevel, getAiFallbackResponse } from './aiPolicy';

describe('aiPolicy', () => {
  describe('isValidHelpLevel', () => {
    it('returns true for levels 1, 2, 3, 4', () => {
      expect(isValidHelpLevel(1)).toBe(true);
      expect(isValidHelpLevel(4)).toBe(true);
    });

    it('returns false for invalid levels', () => {
      expect(isValidHelpLevel(0)).toBe(false);
      expect(isValidHelpLevel(5)).toBe(false);
    });
  });

  describe('validateAiResponse', () => {
    it('flags final numerical answers', () => {
      const response = "Good job! The answer is 42.";
      const result = validateAiResponse(response, 4);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain("Contains final numerical answer");
      expect(result.severity).toBe("high");
    });

    it('flags full solutions', () => {
      const response = "Step 1: do this. Step 2: do that.";
      const result = validateAiResponse(response, 4);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain("Provides complete solution");
      expect(result.severity).toBe("high");
    });

    it('flags direct confirmations', () => {
      const response = "Yes, that's correct!";
      const result = validateAiResponse(response, 4);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain("Confirms correctness directly");
      expect(result.severity).toBe("low");
    });

    it('flags overly long responses for low help levels', () => {
      const longResponse = "A".repeat(501);
      const result = validateAiResponse(longResponse, 2);
      expect(result.valid).toBe(false);
      expect(result.violations).toContain("Response too detailed for help level");
    });

    it('allows valid Socratic questions', () => {
      const response = "What equation relates these variables?";
      const result = validateAiResponse(response, 2);
      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
    });
  });

  describe('getAiFallbackResponse', () => {
    it('returns a fallback string for each help level', () => {
      expect(getAiFallbackResponse(1)).toBeTruthy();
      expect(getAiFallbackResponse(4)).toBeTruthy();
    });
  });
});
