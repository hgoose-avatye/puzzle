import { describe, expect, it } from 'vitest';
import { MockAdService } from './AdService';

describe('MockAdService', () => {
  it('completes rewarded ads by default and records the call', async () => {
    const ads = new MockAdService();
    await expect(ads.showRewarded('clear')).resolves.toBe('completed');
    expect(ads.calls).toEqual([{ kind: 'rewarded', placement: 'clear' }]);
  });
  it('honors the configured rewarded result', async () => {
    await expect(new MockAdService({ rewardedResult: 'skipped' }).showRewarded('x')).resolves.toBe('skipped');
  });
  it('resolves interstitials with undefined and records them', async () => {
    const ads = new MockAdService();
    await expect(ads.showInterstitial('level-end')).resolves.toBeUndefined();
    expect(ads.calls).toEqual([{ kind: 'interstitial', placement: 'level-end' }]);
  });
});
