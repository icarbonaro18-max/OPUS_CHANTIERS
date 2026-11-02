import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecords} from '../lib/record-merge.js';
const a={id:'a',number:'INT-1',notes:'A'},b={id:'b',number:'INT-2',notes:'B'};
test('two devices editing different records retain both edits and a remote creation',()=>{
 const local=[{...a,notes:'Local'},b],remote=[a,{...b,notes:'Remote'},{id:'c',number:'INT-3'}];
 assert.deepEqual(mergeRecords([a,b],local,remote),[local[0],remote[1],remote[2]]);
});
test('different edits to the same record are refused without mutating any input',()=>{
 const local=[{...a,notes:'Local'}],remote=[{...a,notes:'Remote'}];
 assert.throws(()=>mergeRecords([a],local,remote),e=>e.status===412&&e.recordId==='a');assert.equal(remote[0].notes,'Remote');assert.equal(local[0].notes,'Local');
});
test('an already acknowledged creation is idempotent',()=>assert.deepEqual(mergeRecords([], [a], [a]),[a]));
test('local deletion retains remote changes to other records',()=>assert.deepEqual(mergeRecords([a,b],[b],[a,{...b,notes:'Remote'}]),[{...b,notes:'Remote'}]));
test('deletion conflicts with concurrent editing instead of dropping the record',()=>assert.throws(()=>mergeRecords([a],[],[{...a,notes:'Remote'}]),e=>e.status===412));
test('remote deletion conflicts with local editing instead of resurrecting the record',()=>assert.throws(()=>mergeRecords([a],[{...a,notes:'Local'}],[]),e=>e.status===412));
test('duplicate ids and duplicate intervention numbers never pass a merge',()=>{
 assert.throws(()=>mergeRecords([a,a],[a],[a]));assert.throws(()=>mergeRecords([], [a], [{...a,id:'other'}]),e=>e.status===412);
});
