import test from 'node:test';import assert from 'node:assert/strict';import {interventionAlerts,unreadAlerts,alertVersion} from '../lib/team-alerts.js';
test('material and instructions remain unread per tablet until consulted; updates become unread again',()=>{
 const x={id:'i',number:'INT-1',title:'Laurent',plannedStart:'2026-09-16T08:00',request:'Prendre les clés',materialOrders:[{id:'m',fileId:'f',name:'bon.pdf',supplier:'Rexel',pickup:'Buc',updatedAt:'v1'}]};
 const rows=interventionAlerts([x]),tabletA={},tabletB={};
 assert.equal(rows.length,2);assert.equal(unreadAlerts(rows,tabletA).length,2);assert.match(rows[0].detail,/Rexel.*Buc/);assert.equal(rows[0].date,x.plannedStart);
 tabletA[rows[0].id]=alertVersion(rows[0]);assert.equal(unreadAlerts(rows,tabletA).length,1);assert.equal(unreadAlerts(rows,tabletB).length,2);
 x.materialOrders[0].updatedAt='v2';assert.equal(unreadAlerts(interventionAlerts([x]),tabletA).length,2);
 tabletA[rows[1].id]=alertVersion(rows[1]);x.request='Autres clés';assert.equal(unreadAlerts(interventionAlerts([x]),tabletA).length,2);
 assert.equal(interventionAlerts([{...x,status:'annulee'}]).length,0);
});
