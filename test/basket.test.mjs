import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../catalog.json' with {type:'json'};
import {quote} from '../catalog.mjs';
import {review,configure} from '../views.mjs';
import {createServer} from 'node:http';
import {createApp} from '../app.mjs';
const items=[{sku:'compact',quantity:1},{sku:'cable-set',quantity:2}];
test('a mixed cart is server priced with shipping once and Florida tax once',()=>{const q=quote(catalog,{items,country:'US',region:'FL'});assert.equal(q.hardware,875000);assert.equal(q.shipping,0);assert.equal(q.tax,61250);assert.equal(q.amount,936250);assert.equal(q.monthly,0);assert.equal(q.items.length,2);const ca=quote(catalog,{items,country:'CA'});assert.equal(ca.amount,890000);assert.equal(ca.shipping,15000);assert.equal(ca.tax,0);});
test('basket price overrides, duplicate SKUs, test products and retired products are rejected',()=>{for(const lines of [[{sku:'compact',quantity:1,amount:1}],[{sku:'compact',quantity:1},{sku:'compact',quantity:1}],[{sku:'checkout-test-free',quantity:1}],[{sku:'unknown',quantity:1}],[{sku:'cable-set',quantity:11}],[]])assert.throws(()=>quote(catalog,{items:lines,region:'FL'}));});
test('basket contents and preferred provider survive hosted delivery and review forms',()=>{const input={items,country:'US',region:'FL'},q=quote(catalog,input),cfg={mode:'live',ready:true,providers:['stripe','paypal']};const page=review(catalog,cfg,q,{input,nonce:'test',preferredProvider:'paypal'});assert.match(page,/name="items"/);assert.match(page,/value="paypal" selected/);assert.match(page,/AugmentEYE Cable Set/);const delivery=configure(catalog,cfg,{items,country:'US'},'paypal');assert.match(delivery,/name="items"/);assert.match(delivery,/name="provider" value="paypal"/);});
test('a signed basket checkout persists all lines and retries create one provider order',async t=>{
 const orders=new Map();let calls=0;const store={configured:true,ready:async()=>{},put:async o=>{if(!orders.has(o.id))orders.set(o.id,structuredClone(o));},get:async id=>orders.get(id),lock:async(id,op)=>op(orders.get(id)),close:async()=>{}};
 const env={NODE_ENV:'test',PUBLIC_BASE_URL:'http://localhost',SHOP_ENABLED:'true',PAYMENT_MODE:'test',DATABASE_URL:'postgresql://fixture',CHECKOUT_SIGNING_SECRET:'fixture-signing-secret-at-least-32-bytes',STRIPE_SECRET_KEY:'sk_test_fixture123456',STRIPE_WEBHOOK_SECRET:'whsec_fixture123456'};
 const app=createApp(env,catalog,{store,providers:{create:async o=>{calls++;assert.equal(o.amount,936250);assert.equal(o.items.length,2);return{id:'cs_test_fixture12345',url:'https://checkout.stripe.com/c/test'};}}});const server=createServer(app.handle);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const review=await fetch(base+'/checkout?'+new URLSearchParams({items:JSON.stringify(items),region:'FL',provider:'stripe'}));assert.equal(review.status,200);const html=await review.text(),cookie=review.headers.get('set-cookie').split(';')[0],csrf=/name="csrf" value="([a-f0-9]+)"/.exec(html)[1];
 for(let i=0;i<2;i++){const result=await fetch(base+'/payments/create',{method:'POST',redirect:'manual',headers:{origin:'http://localhost',cookie},body:new URLSearchParams({csrf,accept:'yes',provider:'stripe',name:'Test Customer',line1:'123 Test Street',city:'Miami',postal:'33101'})});assert.equal(result.status,303);}
 assert.equal(calls,1);assert.equal(orders.size,1);assert.deepEqual([...orders.values()][0].items.map(p=>p.sku),['compact','cable-set']);
});
