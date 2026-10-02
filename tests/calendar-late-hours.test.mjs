import test from 'node:test';
import assert from 'node:assert/strict';
import {hourLayout} from '../lib/hour-calendar.js';
test('Un rendez-vous à cheval sur minuit apparaît sur chaque journée',()=>{
 const e={start:'2026-10-02T23:00:00',end:'2026-10-03T00:30:00'};
 assert.equal(hourLayout([e],'2026-10-02')[0].end,1440);
 assert.equal(hourLayout([e],'2026-10-03')[0].end,30);
});
