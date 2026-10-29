export type RewardedResult = 'completed' | 'skipped' | 'failed';

export interface AdService {
  showRewarded(placement: string): Promise<RewardedResult>;
  showInterstitial(placement: string): Promise<void>;
}

export interface AdCall {
  kind: 'rewarded' | 'interstitial';
  placement: string;
}

/** Stand-in until the company SDK is wired in; shows nothing, just records calls. */
export class MockAdService implements AdService {
  private readonly log: AdCall[] = [];

  constructor(private readonly options: { rewardedResult?: RewardedResult; delayMs?: number } = {}) {}

  get calls(): ReadonlyArray<AdCall> {
    return this.log;
  }

  async showRewarded(placement: string): Promise<RewardedResult> {
    this.log.push({ kind: 'rewarded', placement });
    await this.wait();
    return this.options.rewardedResult ?? 'completed';
  }

  async showInterstitial(placement: string): Promise<void> {
    this.log.push({ kind: 'interstitial', placement });
    await this.wait();
  }

  private async wait(): Promise<void> {
    const ms = this.options.delayMs ?? 0;
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
