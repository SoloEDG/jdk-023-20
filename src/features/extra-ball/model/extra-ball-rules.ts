import { flashNote, type PinballDocument } from '@/shared/document'

export const EXTRA_SCORE_THRESHOLD = 20000
export const MAX_EXTRA_BALLS = 2
export const BASE_BALL_COUNT = 3

/**
 * 收台瞬间“无倾斜收台”徽章尚未写入生涯状态（那是结算 commitSession 的职责，
 * 因为领到额外球后本局还会继续，若之后倾斜，徽章不能被提前点亮）。
 * 这里用本局的 cleanFinish 条件做一次性的“四项是否首次全亮”判定，
 * 不改动 doc.career，持久化仍由 commitSession 依据最终结果决定。
 */
function tentativeAllLit(doc: PinballDocument, cleanFinish: boolean): boolean {
  return Boolean(
    cleanFinish &&
      doc.career.score10k &&
      doc.career.bonusOnce &&
      doc.career.bankTwice &&
      !doc.career.cleanFinish,
  )
}

function grantExtraBall(doc: PinballDocument, reason: 'score' | 'career'): boolean {
  if (doc.extraBallsEarned >= MAX_EXTRA_BALLS) return false
  doc.extraBalls += 1
  doc.extraBallsEarned += 1
  if (reason === 'score') doc.scoreRewardGiven = true
  else doc.careerRewardGiven = true
  flashNote(doc, reason === 'score' ? '得分跨过两万，奖励额外球一颗' : '生涯四项首次全部点亮，奖励额外球一颗', 2200)
  return true
}

/**
 * 游玩过程中的发放：分数跨阈值（每局一次，不按超出分数叠加）。
 * 生涯四项里的“无倾斜收台”只会在收台结算时点亮，因此这里检查不到，
 * 收台那一刻由 settleDrainRewards 处理。
 */
export function checkFrameRewards(doc: PinballDocument): void {
  if (doc.scoreRewardGiven || doc.extraBallsEarned >= MAX_EXTRA_BALLS) return
  if (doc.score >= EXTRA_SCORE_THRESHOLD) grantExtraBall(doc, 'score')
}

/**
 * 最后一颗球落下、收台判定时调用。
 * cleanFinish 表示本局是否满足无倾斜收台；只要本局开始前任一生涯徽章已点亮，
 * 或本局并非四项首次全部点亮，就不再发放生涯额外球。
 */
export function settleDrainRewards(doc: PinballDocument, cleanFinish: boolean): boolean {
  let awarded = false
  if (!doc.scoreRewardGiven && doc.score >= EXTRA_SCORE_THRESHOLD && doc.extraBallsEarned < MAX_EXTRA_BALLS) {
    awarded = grantExtraBall(doc, 'score') || awarded
  }
  if (
    !doc.careerRewardGiven &&
    doc.careerAllOpenAtStart &&
    tentativeAllLit(doc, cleanFinish) &&
    doc.extraBallsEarned < MAX_EXTRA_BALLS
  ) {
    awarded = grantExtraBall(doc, 'career') || awarded
  }
  return awarded
}
