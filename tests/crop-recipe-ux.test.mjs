import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('const MASTER=JSON.parse');
assert.ok(start>=0);
const app=html.slice(start,html.indexOf('</script>',start));
function section(a,b){
  const start=app.indexOf(a),end=app.indexOf(b,start+a.length);
  assert.ok(start>=0&&end>start,'Missing section '+a);
  return app.slice(start,end);
}
const suggestSource=section('function recipeRegistrationCandidates(', 'function openKnownRecipe(');
const groupSource=section('function knownGroupOptions(', 'function recipeGoalFor(');
const titles={
  pizza:'ピザ',
  herb_sandwich:'ハーブサンドイッチ',
  herb_tea:'ハーブティー',
  cookie:'クッキー',
  mint_tea:'ミントティー'
};
const recipes=Object.keys(titles).map(id=>({id}));
const normalize=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/[\s　・･\-_]+/g,'')
  .replace(/[ァ-ヶ]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60));
function suggest(text,known=[]){
  const c={state:{knownRecipes:known},RECIPE_ROWS:recipes,FALLBACK_RECIPES:{},norm:normalize,rname:id=>titles[id]};
  const fn=runInNewContext(suggestSource+'\nrecipeRegistrationCandidates',c);
  return Array.from(fn(text),r=>r.id);
}
test('existing discovered recipes can be found with short partial names',()=>{
  assert.deepEqual(suggest('ピ',['pizza']),['pizza']);
  assert.deepEqual(suggest('ク',['cookie']),['cookie']);
  assert.deepEqual(suggest('ハーブ',['herb_sandwich']),['herb_sandwich']);
});
test('unknown recipes never appear in a short or ambiguous candidate list',()=>{
  assert.deepEqual(suggest(''),[]);
  assert.deepEqual(suggest('ピ'),[]);
  assert.deepEqual(suggest('ハー'),[]);
  assert.deepEqual(suggest('ハーブ'),[]);
  assert.deepEqual(suggest('ティー'),[]);
});
test('a strongly implied single unknown recipe can be suggested, but only from a prefix',()=>{
  assert.deepEqual(suggest('ピザ'),['pizza']);
  assert.deepEqual(suggest('ハーブサン'),['herb_sandwich']);
  assert.deepEqual(suggest('ブサンド'),[]);
  assert.deepEqual(suggest('ハーブティー'),['herb_tea']);
  assert.deepEqual(suggest('グランドバザール'),[]);
});
test('known recipe candidates update as the player registers recipes',()=>{
  const known=[];
  assert.deepEqual(suggest('ク',known),[]);
  known.push('cookie');
  assert.deepEqual(suggest('ク',known),['cookie']);
});
test('known ingredient group options derive from recorded knowledge, not inventory',()=>{
  const c={
    state:{knownEntities:[]},
    groupById:new Map([['herbs',{members:['mint','lavender','unknown']}]]),
  };
  const knownGroupOptions=runInNewContext(groupSource+'\nknownGroupOptions',c);
  assert.deepEqual(Array.from(knownGroupOptions('herbs')),[]);
  c.state.knownEntities.push('mint');
  assert.deepEqual(Array.from(knownGroupOptions('herbs')),['mint']);
  c.state.knownEntities.push('lavender');
  assert.deepEqual(Array.from(knownGroupOptions('herbs')),['mint','lavender']);
  assert.ok(!groupSource.includes('inventory'));
});
test('crop sheets are read-first, never save view-only visits, and retain edit on refresh',()=>{
  const show=section('function showCrop(id,opts={}){','function intOrNull(');
  assert.ok(show.includes("initialEditing=opts.edit===true||(refresh&&priorSheet.dataset.cropEditMode==='true')"));
  assert.ok(show.includes('id="cropReadQuality"'));
  assert.ok(show.includes('id="cropReadCount"'));
  assert.ok(show.includes('id="cropReadGrowing"'));
  assert.ok(show.includes('id="cropEditToggle"'));
  assert.ok(show.includes("id=\"cropEditFields\" class=\"cropEditFields "));
  assert.ok(show.includes("if(sheet.dataset.cropEverEdited==='true')await persistCrop()"));
  assert.ok(show.includes("$('#cropEditToggle').onclick=()=>{"));
  assert.ok(show.includes("sheet.dataset.cropEditMode=String(open)"));
  assert.ok(show.includes("sheet.dataset.cropEverEdited='true'"));
  assert.ok(!html.includes('.cropCompact.growing{background:'));
  assert.ok(html.includes('class="cropGrowingBadge"'));
  assert.ok(!html.includes('.cropGrowingBanner.active{background:#e3f2df'));
});
test('recipe selection does not register an item until explicit confirmation',()=>{
  const editor=section('function openKnownRecipe(){','function playerHint(');
  assert.ok(editor.includes('id="knownRecipeCandidates"'));
  assert.ok(editor.includes("$$('.knownRecipeCandidate').forEach"));
  assert.ok(editor.includes("$('#knownRecipeName').addEventListener('input',showRecipeCandidates)"));
  assert.ok(editor.includes("$('#knownRecipeName').value=rname(r.id)"));
  assert.ok(editor.includes("$('#registerRecipe').onclick=async()=>"));
  assert.ok(editor.indexOf("state.knownRecipes.push(r.id)")>editor.indexOf("$('#registerRecipe').onclick=async()=>"));
  assert.ok(editor.includes('知っている料理は名前の一部で検索できます'));
  assert.ok(app.includes('所持している現物や在庫数を表すものではありません'));
  assert.equal((html.match(/知っている候補：/g)||[]).length,3);
  new Script(app);
});
