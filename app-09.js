// app-09 loader：載入至 v112；快速補台幣支援雙向匯率換算，並修正手動待同步可一次跑完整批。
(()=>{
  const scripts=[
    ['app-09-base-v61.js',61],
    ['app-10.js',62],
    ['app-11.js',63],
    ['app-12.js',64],
    ['app-13.js',65],
    ['app-14.js',66],
    ['app-15.js',67],
    ['app-16.js',68],
    ['app-17.js',69],
    ['app-18.js',70],
    ['app-19.js',71],
    ['app-20.js',72],
    ['app-21.js',73],
    ['app-22.js',74],
    ['app-23.js',76],
    ['app-24.js',77],
    ['app-25.js',78],
    ['app-26.js',79],
    ['app-27.js',80],
    ['app-28.js',81],
    ['app-29.js',82],
    ['app-30.js',90],
    ['app-31.js',90],
    ['app-32.js',85],
    ['app-33.js',91],
    ['app-35.js',101],
    ['app-36.js',103],
    ['app-37.js',104],
    ['app-38.js',102],
    ['app-39.js',106],
    ['app-40.js',107],
    ['app-41.js',109],
    ['app-42.js','110-final'],
    ['app-43.js','111-quick-twd-rate'],
    ['app-44.js','112-batch-sync']
  ];
  let index=0;
  function loadNext(){
    if(index>=scripts.length)return;
    const [file,version]=scripts[index++];
    const s=document.createElement('script');
    s.src=`${file}?v=${version}`;
    s.async=false;
    s.onload=loadNext;
    document.body.appendChild(s);
  }
  loadNext();
})();
