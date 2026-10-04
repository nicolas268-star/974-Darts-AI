import { expect } from '@playwright/test';

/** Genuine browser rendering/import, with synthetic colour boards, not live-camera accuracy. */
export async function testVisionAuto(page, screenshot) {
  for (const [width,height] of [[540,960],[960,540]]) {
    await page.setViewportSize({width:390,height:844});
    await page.goto('http://127.0.0.1:3008/admin/vision');
    const image = await page.evaluate(({width,height}) => {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d'),data=ctx.createImageData(width,height),radius=Math.min(width,height)*.34;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const px=(x-width*.5)/radius,py=(y-height*.5)/radius,r=Math.hypot(px,py),a=(Math.atan2(px,-py)+Math.PI*2)%(Math.PI*2);
        const index=Math.floor((a+Math.PI/20)/(Math.PI/10))%20;
        let rgb=[80,75,65];if(r<1.25)rgb=[20,20,20];if(r<1)rgb=index%2?[208,198,170]:[44,44,42];
        if((r>=.953&&r<1)||(r>=.582&&r<.630))rgb=index%2?[24,160,80]:[200,38,35];
        if(r<.0935)rgb=[22,160,80];if(r<.0374)rgb=[200,38,35];if(r>1.20&&r<1.25)rgb=[255,20,20];
        data.data.set([...rgb,255],(y*width+x)*4);
      }
      ctx.putImageData(data,0,0);return canvas.toDataURL('image/png').split(',')[1];
    },{width,height});
    await page.getByText('Tester avec deux images, sans caméra',{exact:true}).click();
    await page.getByLabel('Image AVANT',{exact:true}).setInputFiles({name:'colour-board.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
    await page.getByRole('button',{name:'Détecter ma cible',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Détection de la cible'}),canvas=dialog.locator('canvas[data-vision-frame]');
    const apply=dialog.getByRole('button',{name:'Appliquer cette détection',exact:true});
    await expect(dialog.getByRole('status')).toContainText('Contours proposés',{timeout:30000});
    const initial=JSON.parse(await canvas.getAttribute('data-anchors'));
    expect(initial).toHaveLength(5);expect(Math.hypot(initial[4].x-.5,initial[4].y-.5)).toBeLessThan(.018);
    await expect(apply).toBeDisabled();
    await dialog.getByLabel('Le centre, les doubles et les triples suivent ma cible.',{exact:true}).check();
    await expect(apply).toBeDisabled();
    await dialog.getByLabel('Le 20 de la grille correspond au vrai 20.',{exact:true}).check();
    await expect(apply).toBeEnabled();
    await dialog.getByRole('button',{name:'Droite →',exact:true}).click();
    await expect(apply).toBeDisabled();
    const moved=JSON.parse(await canvas.getAttribute('data-anchors'));
    expect(moved[4].x-initial[4].x).toBeCloseTo(1/width,6);
    for(const label of ['+ Agrandir','↷ Rotation droite','+ 1 secteur'])await dialog.getByRole('button',{name:label,exact:true}).click();
    await dialog.getByRole('button',{name:'Rétablir la proposition',exact:true}).click();
    expect(JSON.parse(await canvas.getAttribute('data-anchors'))).toEqual(initial);
    await dialog.getByLabel('Le centre, les doubles et les triples suivent ma cible.',{exact:true}).check();
    await dialog.getByLabel('Le 20 de la grille correspond au vrai 20.',{exact:true}).check();
    const bitmap=await canvas.evaluate(el=>Array.from(el.getContext('2d').getImageData(0,0,el.width,el.height).data));
    const box=await canvas.boundingBox();expect(box.width/box.height).toBeCloseTo(width/height,3);
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await screenshot(page,`vision-auto-${width}x${height}.png`,{fullPage:false});
    await apply.click();await expect(dialog).toHaveCount(0);
    const main=page.locator('canvas[aria-label="Image de référence : placez les repères"]');
    expect(JSON.parse(await main.getAttribute('data-anchors'))).toEqual(initial);
    // Compare actual pixels after apply, not just stored coordinates. Ignore the added point labels.
    const identical=await main.evaluate((el,previous)=>{
      const now=el.getContext('2d').getImageData(0,0,el.width,el.height).data;
      const markers=JSON.parse(el.getAttribute('data-markers'));let count=0;
      for(let y=8;y<el.height-8;y+=13)for(let x=8;x<el.width-8;x+=13){
        if(markers.some(m=>Math.hypot(x-m.point.x*el.width,y-m.point.y*el.height)<70))continue;
        const i=(y*el.width+x)*4;for(let c=0;c<4;c++)if(now[i+c]!==previous[i+c])return false;count++;
      }
      return count>300;
    },bitmap);
    expect(identical).toBe(true);
    const mainBox=await main.boundingBox();expect(mainBox.width/mainBox.height).toBeCloseTo(width/height,3);
    await page.getByRole('button',{name:'Détecter ma cible',exact:true}).click();
    await expect(dialog.getByRole('status')).toContainText('Contours proposés');
    await dialog.getByRole('button',{name:'Bas ↓',exact:true}).click();
    await dialog.getByRole('button',{name:'Fermer sans appliquer',exact:true}).click();
    expect(JSON.parse(await main.getAttribute('data-anchors'))).toEqual(initial);
  }
  // Refusal and cancellation cannot manufacture a calibration or keep an old image's result.
  await page.goto('http://127.0.0.1:3008/admin/vision');
  const blank=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=540;c.height=960;c.getContext('2d').fillRect(0,0,540,960);return c.toDataURL('image/png').split(',')[1];});
  await page.getByText('Tester avec deux images, sans caméra',{exact:true}).click();
  await page.getByLabel('Image AVANT',{exact:true}).setInputFiles({name:'blank.png',mimeType:'image/png',buffer:Buffer.from(blank,'base64')});
  await page.getByRole('button',{name:'Détecter ma cible',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Détection de la cible'});
  await expect(dialog.getByRole('status')).toContainText('Cible non reconnue');
  await expect(dialog.getByRole('button',{name:'Appliquer cette détection',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Calibrer en grand · zoom et loupe',exact:true})).toBeEnabled();
  console.log('PASS vision auto: colour rings, 540x960/960x540, two confirmations, position/size/rotation, reset, identical real pixels after apply, cancel and blank-scene refusal.');
}
