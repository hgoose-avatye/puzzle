/** Test boards for the 3-cell crocodile (id 1, cells head first). Board 6 x 8, x right, y down the screen. */
import type { Level } from './rules';

export interface Scene { title: string; level: Level; note: string }

const croc = (cells: Array<[number, number]>) => ({ id: 1, cells: cells.map(([x, y]) => ({ x, y })) });
const W = 6, H = 8;

export const SCENES: Record<string, Scene> = {
  straight: {
    title: '직선', note: '오른쪽으로 곧장 나가요',
    level: { width: W, height: H, pieces: [croc([[3, 4], [2, 4], [1, 4]])] },
  },
  down: {
    title: '직선 ↓', note: '아래로 곧장 나가요',
    level: { width: W, height: H, pieces: [croc([[2, 3], [2, 2], [2, 1]])] },
  },
  up: {
    title: '직선 ↑', note: '위로 곧장 나가요',
    level: { width: W, height: H, pieces: [croc([[3, 4], [3, 5], [3, 6]])] },
  },
  left: {
    title: '직선 ←', note: '왼쪽으로 곧장 나가요',
    level: { width: W, height: H, pieces: [croc([[2, 4], [3, 4], [4, 4]])] },
  },
  turn: {
    title: '90° 꺾기', note: '화살표 칸에서 위로 꺾여요',
    level: { width: W, height: H, pieces: [croc([[2, 6], [1, 6], [0, 6]])], arrows: [{ x: 4, y: 6, dir: 'up' }] },
  },
  zigzag: {
    title: '연속 꺾기', note: '두 칸마다 꺾여서 머리·몸통·꼬리가 서로 다른 쪽을 봐요',
    level: { width: W, height: H, pieces: [croc([[2, 7], [1, 7], [0, 7]])], arrows: [{ x: 3, y: 7, dir: 'up' }, { x: 3, y: 5, dir: 'left' }, { x: 1, y: 5, dir: 'up' }] },
  },
  stairs: {
    title: '계단 꺾기', note: '한 칸마다 꺾여요: 머리·몸통·꼬리가 동시에 세 방향을 봐요',
    level: { width: W, height: H, pieces: [croc([[2, 7], [1, 7], [0, 7]])], arrows: [{ x: 3, y: 7, dir: 'up' }, { x: 3, y: 6, dir: 'left' }, { x: 2, y: 6, dir: 'up' }] },
  },
  'chick-down': { title: '병아리 ↓', note: '1칸 병아리 · 아래', level: { width: W, height: H, pieces: [{ id: 1, cells: [{ x: 2, y: 2 }], dir: 'down' }] } },
  'chick-up': { title: '병아리 ↑', note: '1칸 병아리 · 위', level: { width: W, height: H, pieces: [{ id: 1, cells: [{ x: 3, y: 5 }], dir: 'up' }] } },
  'chick-left': { title: '병아리 ←', note: '1칸 병아리 · 왼쪽', level: { width: W, height: H, pieces: [{ id: 1, cells: [{ x: 4, y: 4 }], dir: 'left' }] } },
  'chick-right': { title: '병아리 →', note: '1칸 병아리 · 오른쪽', level: { width: W, height: H, pieces: [{ id: 1, cells: [{ x: 1, y: 3 }], dir: 'right' }] } },
  'chick-turns': {
    title: '병아리 꺾기', note: '오른쪽 → 위 → 왼쪽 → 위: 달리면서 방향이 바뀌어요',
    level: { width: W, height: H, pieces: [{ id: 1, cells: [{ x: 0, y: 6 }], dir: 'right' }], arrows: [{ x: 3, y: 6, dir: 'up' }, { x: 3, y: 4, dir: 'left' }, { x: 1, y: 4, dir: 'up' }] },
  },
  'two-straight': {
    title: '2칸 직선', note: '2칸 시험 동물(악어 머리+꼬리 승인 그림, 호환성 검증용)',
    level: { width: W, height: H, pieces: [croc([[3, 4], [2, 4]])] },
  },
  'two-turn': {
    title: '2칸 꺾기', note: '2칸 시험 동물 · 아래로 가다 오른쪽으로 꺾여요',
    level: { width: W, height: H, pieces: [croc([[2, 2], [2, 1]])], arrows: [{ x: 2, y: 4, dir: 'right' }] },
  },
  rock: {
    title: '장애물', note: '바위가 막고 있어요: 움직이지 않고 하트가 줄어요',
    level: { width: W, height: H, pieces: [croc([[2, 3], [1, 3], [0, 3]])], obstacles: [{ x: 4, y: 3 }] },
  },
  friend: {
    title: '다른 동물', note: '병아리가 막고 있어요. 병아리를 먼저 보내면 악어도 나가요',
    level: { width: W, height: H, pieces: [croc([[2, 5], [1, 5], [0, 5]]), { id: 2, cells: [{ x: 4, y: 5 }], dir: 'up' }] },
  },
  facing: {
    title: '반대 화살표', note: '마주 보는 화살표는 벽이에요',
    level: { width: W, height: H, pieces: [croc([[2, 2], [1, 2], [0, 2]])], arrows: [{ x: 4, y: 2, dir: 'left' }] },
  },
  loop: {
    title: '반복 경로', note: '화살표가 빙글 돌아 제자리로 오면 막혀요',
    level: { width: W, height: H, pieces: [croc([[2, 1], [1, 1], [0, 1]])], arrows: [{ x: 3, y: 1, dir: 'right' }, { x: 4, y: 1, dir: 'down' }, { x: 4, y: 2, dir: 'left' }, { x: 3, y: 2, dir: 'up' }] },
  },
};
