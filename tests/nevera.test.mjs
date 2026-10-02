import {test} from 'node:test';import assert from 'node:assert/strict';
import {validatePayload,sameIdentity} from '../extensions/nevera/shared.js';
import {neveraPayload} from '../lib/nevera-export.ts';
const c={id:'c',customer_code:'4048',tax_id:'12345678901',name:'Cliente de teste',credit_limit:8382171};
test('copies saved customer limit exactly without recalculation',()=>{const p=neveraPayload(c,'Operador');assert.equal(p.limitCents,8382171);assert.match(p.observation,/83\.821,71/);assert.equal(validatePayload(p),p);});
test('zero is retained, invalid limits are rejected',()=>{assert.equal(neveraPayload({...c,credit_limit:0},'a').limitCents,0);for(const v of [-1,1.5,NaN,Infinity,null])assert.throws(()=>neveraPayload({...c,credit_limit:v},'a'));});
test('matching requires both code and CPF/CNPJ',()=>{const p=neveraPayload(c,'a');assert.equal(sameIdentity({code:'04048',taxId:'123.456.789-01'},p),true);assert.equal(sameIdentity({code:'4049',taxId:p.taxId},p),false);assert.equal(sameIdentity({code:p.code,taxId:'99999999999'},p),false);});
test('expired or future requests are rejected',()=>{const p=neveraPayload(c,'a');assert.throws(()=>validatePayload(p,Date.now()+16*60000));assert.throws(()=>validatePayload(p,Date.now()-120000));});
test('malformed requests cannot fill Nevera',()=>{const p=neveraPayload(c,'a');for(const change of [{limitCents:-1},{limitCents:1.5},{taxId:'1'},{code:'foo'},{observation:''},{observation:'x'.repeat(2001)},{createdAt:'invalid'},{version:2}])assert.throws(()=>validatePayload({...p,...change}));});
