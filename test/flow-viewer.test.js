import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFlow } from '../runtime/src/viewer/flows.js';

// Minimal executable DOM port: tests operate the rendered controls, not source text.
function surface() {
  const observers = [], frames = new Map();
  let nextFrame = 0;
  const document = { activeElement:null, createElement: tag => new Element(tag) };
  class Element {
    constructor(tag) {
      this.tagName=tag; this.children=[]; this.attributes={}; this.events={}; this.style={}; this.className=''; this.ownText=''; this.clientWidth=900;
      this.classList={ toggle:(value,on) => {
        const values=new Set(this.className.split(' ').filter(Boolean));
        if(on) values.add(value); else values.delete(value);
        this.className=[...values].join(' ');
      } };
    }
    set textContent(value) { this.ownText=String(value); this.children=[]; }
    get textContent() { return this.ownText+this.children.map(child=>child.textContent).join(''); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.ownText=''; this.children=children; }
    setAttribute(name,value) { this.attributes[name]=value; }
    addEventListener(type,callback) { this.events[type]=callback; }
    click() { if(!this.disabled) this.events.click?.(); }
    focus() { document.activeElement=this; }
    scrollIntoView() { this.scrolled=true; }
    querySelector(tag) { return descendants(this).find(child=>child.tagName===tag); }
    getBoundingClientRect() {
      const left=(Number(this.style.gridColumn||1)-1)*180, top=(Number(this.style.gridRow||1)-1)*180;
      return { left,top,right:left+152,bottom:top+140,width:this.className==='flow-graph'?900:152,height:this.className==='flow-graph'?320:140 };
    }
    getContext() { return { scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},closePath(){},fill(){} }; }
  }
  const environment = {
    devicePixelRatio:2,
    requestAnimationFrame:callback=>{ frames.set(++nextFrame,callback); return nextFrame; },
    cancelAnimationFrame:id=>frames.delete(id),
    getComputedStyle:()=>({getPropertyValue:()=> '#91a4b2'}),
    ResizeObserver:class {
      constructor(callback) { this.callback=callback; observers.push(this); }
      observe() { this.connected=true; }
      disconnect() { this.connected=false; }
    },
  };
  const container=new Element('main');
  const flush=()=>{ const callbacks=[...frames.values()]; frames.clear(); callbacks.forEach(callback=>callback()); };
  return { container,document,environment,observers,frames,flush };
}
function descendants(node) { return node.children.flatMap(child=>[child,...descendants(child)]); }
function control(container,label) {
  const result=descendants(container).find(node=>node.attributes['aria-label']===label);
  assert.ok(result,`Missing control: ${label}`);
  return result;
}
function model() {
  return { flows:[
    { name:'daily-run', sections:[{title:'Scenario',text:'A real input: <script>literal & text</script>.'}], blocks:[{title:'Receive',summary:'Keep the identity.',steps:[1]},{title:'Track stories',summary:'Connect articles to memory.',steps:[2]}],
      steps:[{number:1,type:'transfer',from:'operator',to:'worker',text:'Keep <b>literal markup</b> & identifiers.'},{number:2,type:'transfer',from:'worker',to:'tracker',text:'Track the classified articles.',flow:'story-matching'}] },
    { name:'story-matching', sections:[], steps:[{number:1,type:'transfer',from:'tracker',to:'llm',text:'Judge a match.',flow:'cached-completion'}] },
    { name:'cached-completion', sections:[], steps:[{number:1,type:'transfer',from:'llm',to:'cache',text:'Look up the response.'}] },
  ] };
}

test('process blocks inspect original steps, copy IDs and open only authored inner flows', () => {
  const ui=surface(), copied=[], routes=[], selected=[];
  const instance=renderFlow(ui.container,{...ui,model:model(),trail:[{flow:'daily-run',step:null}],copy:value=>copied.push(value),navigate:hash=>routes.push(hash),select:number=>selected.push(number)});
  ui.flush();
  assert.match(ui.container.textContent, /A real input: <script>literal & text<\/script>\./);
  control(ui.container,'Copy #daily-run.2').click();
  assert.deepEqual(copied,['#daily-run.2']);
  control(ui.container,'Inspect Receive').click();
  assert.equal(selected.at(-1),1);
  const detail=descendants(ui.container).find(node=>node.className==='flow-detail');
  assert.match(detail.textContent,/Keep <b>literal markup<\/b> & identifiers\./);
  control(ui.container,'Copy #operator').click();
  assert.equal(copied.at(-1),'#operator');
  control(ui.container,'Open story-matching inside step 2').click();
  assert.deepEqual(routes,['#flow/daily-run/2/story-matching']);
  assert.equal(descendants(ui.container).filter(node=>node.attributes['aria-label']?.startsWith('Open ')&&node.attributes['aria-label']?.includes('step 1')).length,0);
  assert.equal(ui.observers[0].connected,true);
  instance.destroy();
  assert.equal(ui.observers[0].connected,false);
  assert.equal(ui.frames.size,0);
});

test('a second nested level has working parent breadcrumbs and direct child links', () => {
  const ui=surface(), routes=[];
  const instance=renderFlow(ui.container,{...ui,model:model(),trail:[{flow:'daily-run',step:2},{flow:'story-matching',step:null}],copy(){},navigate:hash=>routes.push(hash)});
  control(ui.container,'Open cached-completion inside step 1').click();
  assert.deepEqual(routes,['#flow/daily-run/2/story-matching/1/cached-completion']);
  const links=descendants(ui.container).filter(node=>node.tagName==='a');
  assert.ok(links.some(link=>link.textContent==='daily-run'&&link.href==='#flow/daily-run'));
  assert.ok(links.some(link=>link.textContent==='← Parent flow'&&link.href==='#flow/daily-run'));
  instance.destroy();
});

test('live model replacement keeps the selected step while releasing the old layout observer', () => {
  const ui=surface();
  let selected;
  const options={...ui,model:model(),trail:[{flow:'daily-run',step:null}],copy(){},navigate(){},select:number=>{selected=number;}};
  const first=renderFlow(ui.container,options);
  control(ui.container,'Inspect Receive').click();
  first.destroy(); ui.container.replaceChildren();
  const next=model(); next.flows[0].steps[0].text='Updated during the live session.';
  const second=renderFlow(ui.container,{...options,model:next,selected});
  assert.match(descendants(ui.container).find(node=>node.className==='flow-detail').textContent,/Updated during the live session\./);
  assert.equal(ui.observers[0].connected,false);
  assert.equal(ui.observers[1].connected,true);
  second.destroy();
});

test('missing and cyclic child references cannot navigate; repeats select their earlier step', () => {
  const ui=surface(), routes=[];
  const current=model();
  current.flows[0].steps[1].flow='daily-run';
  current.flows[0].steps.push({number:3,type:'transfer',from:'worker',to:'tracker',text:'Missing.',flow:'missing'},{number:4,type:'repeat',fromStep:1,text:'done'});
  const instance=renderFlow(ui.container,{...ui,model:current,trail:[{flow:'daily-run',step:null}],copy(){},navigate:hash=>routes.push(hash)});
  for(const label of ['Open daily-run inside step 2','Open missing inside step 3']) {
    const button=control(ui.container,label); assert.equal(button.disabled,true); button.click();
  }
  assert.deepEqual(routes,[]);
  const repeat=descendants(ui.container).find(node=>node.className==='flow-repeat');
  repeat.click();
  assert.equal(ui.document.activeElement.attributes['aria-label'],'Inspect Receive');
  assert.equal(descendants(ui.container).find(node=>node.className.includes('flow-process selected')).scrolled,true);
  instance.destroy();
});
