import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('function openRecipeGoalQty(');
const end=html.indexOf('\nfunction plan(){',start);
assert.ok(start>=0&&end>start,'Recipe quantity handler must exist');
const source=html.slice(start,end);
const mainSource=readFileSync(new URL('./fixtures/recipe-goal-qty-main.js',import.meta.url),'utf8');

// Entirely synthetic Player State, unrelated goals and requirement rows.
function fixture(title='テスト料理 ×3',targetQty=3){
  return {
    goals:[{id:'recipe',title,targetQty,sourceRecipeId:'recipe-id',status:'active',note:'keep'},
      {id:'other',title:'別の料理 ×2',targetQty:2,sourceRecipeId:'other-recipe',status:'active'},
      {id:'manual',title:'手動の目標',status:'active'}],
    requirements:{recipe:[
      {label:'材料A',need:6,have:5,sourceRecipeId:'recipe-id',targetId:'a',quality:'2'},
      {label:'丸めあり',need:4,have:4,sourceRecipeId:'recipe-id',targetId:'b'},
      {label:'最小単位',need:0,have:0,sourceRecipeId:'recipe-id',targetId:'c'},
      {label:'手動追加',need:17,have:9,targetId:'manual'},
      {label:'別料理由来',need:8,have:7,sourceRecipeId:'other-recipe'}
    ],other:[{label:'他の目標の材料',need:8,have:6,sourceRecipeId:'other-recipe'}]},
    playerState:{a:{count:12,note:'変更しない'}},knownRecipes:['recipe-id'],
    actions:[{id:'action',goalId:'recipe',text:'材料を集める',done:false}],
    ui:{goalReturnTo:'recipe'},season:'春'
  };
}

function harness(input=fixture(),handler=source){
  const state=structuredClone(input),events=[],saved=[],master={recipes:[{id:'recipe-id'}]};
  const dom={'#editRecipeQty':{value:''},'#saveRecipeQty':{},'#cancelRecipeQty':{}};
  const open=runInNewContext(handler+'\nopenRecipeGoalQty',{
    state,MASTER:master,$:selector=>dom[selector],esc:String,deferMemoNavigation:()=>false,
    rname:id=>id==='recipe-id'?'テスト料理':'別の料理',
    modal:markup=>events.push(['modal',markup]),
    save:async()=>{saved.push(structuredClone(state));events.push(['save'])},
    returnToGoal:id=>events.push(['return',id]),toast:text=>events.push(['toast',text])
  });
  return {state,events,saved,master,dom,open,async update(qty){
    open('recipe');
    assert.equal(typeof dom['#saveRecipeQty'].onclick,'function');
    dom['#editRecipeQty'].value=String(qty);
    await dom['#saveRecipeQty'].onclick();
  }};
}

test('automatic title follows the new quantity using the old targetQty',async()=>{
  const h=harness();await h.update(5);
  assert.equal(h.state.goals[0].title,'テスト料理 ×5');
  assert.equal(h.state.goals[0].targetQty,5);
  assert.equal(h.saved[0].goals[0].title,'テスト料理 ×5');
  assert.deepEqual(h.events.slice(1),[['save'],['return','recipe'],['toast','作る数を更新しました']]);
});

test('legacy targetQty defaults use the original quantity normalization',async()=>{
  for(const old of [undefined,null,0,-2,1,'1']){
    const input=fixture('テスト料理 ×1');input.goals[0].targetQty=old;
    const h=harness(input);await h.update(4);
    assert.equal(h.state.goals[0].title,'テスト料理 ×4');
    assert.equal(h.state.goals[0].targetQty,4);
  }
});

for(const title of ['春の出荷用','  手動\n目標 ★ ×3  ','テスト料理×3','テスト料理  ×3',
  'テスト料理　×3',' テスト料理 ×3','テスト料理 ×3 ','テスト料理 ×3\n',
  'テスト料理\n×3','テスト料理\t×3','テスト料理 × 3','テスト料理 ×03','テスト料理 ×5','']){
  test('preserves the exact custom title '+JSON.stringify(title),async()=>{
    const h=harness(fixture(title));await h.update(5);
    assert.equal(h.state.goals[0].title,title);
    assert.equal(h.saved[0].goals[0].title,title,'Persistence must not trim or rewrite');
    assert.equal(h.state.goals[0].targetQty,5);
  });
}

test('unchanged quantity does not write the title',async()=>{
  for(const title of ['テスト料理 ×3','  自分の目標\n★  ']){
    const h=harness(fixture(title));let writes=0;
    Object.defineProperty(h.state.goals[0],'title',{
      enumerable:true,get:()=>title,set:()=>{writes++}
    });
    await h.update(3);
    assert.equal(writes,0);
    const expected=fixture(title);
    // Existing main rounds 4 / 3 to one unit even when the quantity stays 3.
    expected.requirements.recipe[1].need=3;
    expected.requirements.recipe[1].have=3;
    expected.requirements.recipe[2].need=3; // Existing minimum unit is one.
    assert.deepEqual(h.state,expected);
  }
});

test('missing goal or sourceRecipeId is a complete no-op',()=>{
  for(const sourceRecipeId of [undefined,null,'']){
    const input=fixture();input.goals[0].sourceRecipeId=sourceRecipeId;
    const h=harness(input);h.open('recipe');h.open('missing');
    assert.deepEqual(h.state,input);assert.deepEqual(h.events,[]);assert.deepEqual(h.saved,[]);
    assert.equal(h.dom['#saveRecipeQty'].onclick,undefined);
  }
});

test('cancel returns to the same goal without changing or saving state',()=>{
  const h=harness();h.open('recipe');h.dom['#cancelRecipeQty'].onclick();
  assert.deepEqual(h.state,fixture());assert.deepEqual(h.saved,[]);
  assert.deepEqual(h.events.slice(1),[['return','recipe']]);
});

test('other goals, manual requirements, Player State and Master are untouched',async()=>{
  const h=harness(),before=structuredClone(h.state),master=structuredClone(h.master);
  await h.update(1);
  assert.deepEqual(h.state.goals.slice(1),before.goals.slice(1));
  assert.deepEqual(h.state.requirements.recipe.slice(3),before.requirements.recipe.slice(3));
  assert.deepEqual(h.state.requirements.other,before.requirements.other);
  assert.deepEqual(h.state.playerState,before.playerState);
  assert.deepEqual(h.master,master);
  assert.equal(h.state.goals[0].sourceRecipeId,'recipe-id');
  assert.deepEqual(h.state.requirements.recipe.slice(0,3).map(({need,have})=>({need,have})),
    [{need:2,have:2},{need:1,have:1},{need:1,have:0}]);
});

test('all state except the protected title and all side effects match original main',async()=>{
  for(const old of [undefined,null,0,-2,1,3,'3']){
    for(const qty of [1,2,3,7,'',0,-4,'invalid']){
      for(const title of ['テスト料理 ×'+Math.max(1,old||1),'  手動\n目標 ★  ']){
        const input=fixture(title,old);
        input.goals[0].targetQty=old;
        const current=harness(input),main=harness(input,mainSource);
        await current.update(qty);await main.update(qty);
        // The only permitted difference is this goal's title, also in saved state.
        const expectedTitle=current.state.goals[0].title;
        main.state.goals[0].title=expectedTitle;
        main.saved[0].goals[0].title=expectedTitle;
        assert.deepEqual(current.state,main.state,JSON.stringify({old,qty,title}));
        assert.deepEqual(current.saved,main.saved);
        assert.deepEqual(current.events,main.events);
      }
    }
  }
});
