// Level registry. Worlds are added as they are built; gyms are dev rooms.

import { registerLevels } from '../level.js';
import { GYM_LEVELS } from './gym.js';
import { W1_LEVELS, W1_ORDER } from './world1.js';
import { W2_LEVELS, W2_ORDER } from './world2.js';
import { W3_LEVELS, W3_ORDER } from './world3.js';
import { W4_LEVELS, W4_ORDER } from './world4.js';

export const LEVELS = {
  ...GYM_LEVELS,
  ...W1_LEVELS, ...W2_LEVELS, ...W3_LEVELS, ...W4_LEVELS,
};

// verification order: the campaign plus every practice room — the Training
// Grove is most players' first level and gets no exemption from QA
export const LEVEL_ORDER = [...W1_ORDER, ...W2_ORDER, ...W3_ORDER, ...W4_ORDER, 'gym', 'gym2', 'parade'];

registerLevels(LEVELS, LEVEL_ORDER);
