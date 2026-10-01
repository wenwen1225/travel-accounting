function makeTripName(place,start,end){
  const s = new Date(start+'T00:00:00');
  const e = new Date(end+'T00:00:00');
  const yy = String(s.getFullYear()).slice(-2);
  const sm = String(s.getMonth()+1).padStart(2,'0');
  const sd = String(s.getDate()).padStart(2,'0');
  const em = String(e.getMonth()+1).padStart(2,'0');
  const ed = String(e.getDate()).padStart(2,'0');
  if(s.getMonth()===e.getMonth() && s.getFullYear()===e.getFullYear()){
    return `${place} ${yy}_${sm}_${sd}_${ed}`;
  }
  if(s.getFullYear()===e.getFullYear()){
    return `${place} ${yy}_${sm}_${sd}_${em}_${ed}`;
  }
  const eyy = String(e.getFullYear()).slice(-2);
  return `${place} ${yy}_${sm}_${sd}_${eyy}_${em}_${ed}`;
}

function tripDurationText(start,end){
  const startYmd = normalizeTripDateValue(start);
  const endYmd = normalizeTripDateValue(end);
  const s=parseLocalDate(startYmd);
  const e=parseLocalDate(endYmd);
  if(!s || !e || e<s) return '';
  const days=Math.round((e.getTime()-s.getTime())/86400000)+1;
  const nights=Math.max(0,days-1);
  return days+'天'+nights+'夜';
}

function getTripStatus(start,end){
  const today = typeof getLocalDateYmd==='function'
    ? getLocalDateYmd()
    : (()=>{ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return y+'-'+m+'-'+day; })();

  const s = normalizeTripDateValue(start);
  const e = normalizeTripDateValue(end);

  if(!s || !e) return {label:'日期未完整',className:'trip-status-unknown'};
  if(today < s) return {label:'尚未出發',className:'trip-status-upcoming'};
  if(today > e) return {label:'已結束',className:'trip-status-ended'};
  return {label:'旅行中',className:'trip-status-active'};
}

function renderHome(){
  updateHomeSyncStatus();
  const box = document.getElementById('tripList');
  if(!state.trips.length){
    box.innerHTML = `
      <div class="card empty">
        <div style="font-size:36px;margin-bottom:10px">🧳</div>
        還沒有旅行紀錄。<br>先建立第一趟旅行吧！
      </div>`;
    return;
  }
  box.innerHTML = state.trips.map(t=>{
    const all = [...(t.expenses||[]), ...(t.pretrip||[])];
    const total = all.reduce((s,x)=>s+Number(x.twd||0),0);
    const status = getTripStatus(t.start,t.end);
    return `
      <div class="card trip-card" onclick="openTrip('${t.id}')">
        <div class="trip-head">
          <div>
            <h3>${t.name}</h3>
            <p>${normalizeTripDateValue(t.start)} ～ ${normalizeTripDateValue(t.end)} · ${tripDurationText(t.start,t.end)}</p>
          </div>
          <div class="trip-card-tags">
            <span class="trip-status ${status.className}">${status.label}</span>
            <span class="mini-tag">${t.currency} / TWD</span>
          </div>
        </div>
        <div class="amount">${fmtMoney(total,'TWD')}</div>
        <div class="sub">${(t.expenses||[]).length + (t.pretrip||[]).length + (t.exchange||[]).length} 筆紀錄</div>
      </div>`;
  }).join('');
}

function goHome(){
  currentTrip = null;
  attachMoneyFormat('expenseForeign');
attachMoneyFormat('expenseTwd');
attachMoneyFormat('pretripTwd');
attachMoneyFormat('pretripForeign');
attachMoneyFormat('exchangeTwd');
attachMoneyFormat('exchangeForeign');
renderHome();
  showPage('page-home');
}

function openCreateTrip(){
  document.getElementById('tripPlace').value = '';
  document.getElementById('tripStart').value = '';
  document.getElementById('tripEnd').value = '';
  document.getElementById('tripEnd').min = '';
  document.getElementById('tripEnd').disabled = true;
  const hint = document.getElementById('endDateHint');
  hint.textContent = '請先選開始日期';
  hint.classList.remove('date-hint-ok','date-hint-error');
  renderTripPeopleChips();
  showPage('page-create');
}


function personClass(name){
  if(name==='Wen') return 'person-wen';
  if(name==='Clark') return 'person-clark';
  if(name==='Anna') return 'person-anna';
  const extras = state.people.filter(p=>!['Wen','Clark','Anna'].includes(p));
  const idx = Math.max(0, extras.indexOf(name));
  return 'person-extra-' + (idx % 5);
}

function renderTripPeopleChips(){
  const box = document.getElementById('tripPeopleChips');
  const peopleButtons = state.people.map(p=>`<button class="chip person-chip ${personClass(p)} active" data-person="${p}" onclick="this.classList.toggle('active')">${p}</button>`).join('');
  box.innerHTML = peopleButtons + `<button class="chip" onclick="addTripPersonInline()">＋新增同行人</button>`;
}

function addTripPersonInline(){
  const name = prompt('請輸入同行人名稱');
  if(!name) return;
  const v = name.trim();
  if(!v) return;
  if(!state.people.includes(v)){
    state.people.push(v);
    persist();
  }
  renderTripPeopleChips();
  const btn = [...document.querySelectorAll('#tripPeopleChips .chip')].find(b=>b.dataset.person===v);
  if(btn) btn.classList.add('active');
}

function parseLocalDate(value){
  if(!value) return null;
  const [y,m,d] = value.split('-').map(Number);
  if(!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

function validateTripDates(clearInvalid=false){
  const startInput = document.getElementById('tripStart');
  const endInput = document.getElementById('tripEnd');
  const hint = document.getElementById('endDateHint');

  const startValue = startInput.value;
  const endValue = endInput.value;

  endInput.min = startValue || '';
  endInput.disabled = !startValue;

  hint.classList.remove('date-hint-ok','date-hint-error');

  if(!startValue){
    hint.textContent = '請先選開始日期';
    return false;
  }

  if(!endValue){
    hint.textContent = '請選擇結束日期';
    return false;
  }

  const startDate = parseLocalDate(startValue);
  const endDate = parseLocalDate(endValue);

  if(!startDate || !endDate){
    hint.textContent = '日期格式有誤，請重新選擇';
    hint.classList.add('date-hint-error');
    return false;
  }

  if(endDate.getTime() < startDate.getTime()){
    hint.textContent = '結束日期不能早於開始日期';
    hint.classList.add('date-hint-error');
    if(clearInvalid) endInput.value = '';
    return false;
  }

  hint.textContent = '✓ 日期設定正確';
  hint.classList.add('date-hint-ok');
  return true;
}

function syncTripDates(){
  validateTripDates(true);
}

async function createTrip(){
  const btn=document.getElementById('createTripBtn');
  if(btn?.dataset.saving==='1') return;

  try{
    const place = document.getElementById('tripPlace').value.trim();
    const start = document.getElementById('tripStart').value;
    const end = document.getElementById('tripEnd').value;
    const currency = document.getElementById('tripCurrency').value;
    const people = [...document.querySelectorAll('#tripPeopleChips .chip.active')]
      .map(x=>x.dataset.person)
      .filter(Boolean);

    if(!place){
      alert('請填寫旅行地點');
      document.getElementById('tripPlace').focus();
      return;
    }

    if(!start){
      alert('請先選擇開始日期');
      document.getElementById('tripStart').focus();
      return;
    }

    if(!end){
      alert('請先選擇結束日期');
      document.getElementById('tripEnd').focus();
      return;
    }

    if(!validateTripDates(false)){
      document.getElementById('tripEnd').focus();
      return;
    }

    if(!currency){
      alert('請選擇主要外幣');
      document.getElementById('tripCurrency').focus();
      return;
    }

    if(!people.length){
      alert('至少選一位記帳對象');
      return;
    }

    const tripName=makeTripName(place,start,end);
    const duplicate=(state.trips||[]).find(t =>
      String(t.name||'').trim().toLowerCase() === tripName.toLowerCase()
    );

    if(duplicate){
      const ok=confirm(
        '已經有一趟同名旅行：\n'+tripName+
        '\n\n確定還要再建立一趟嗎？'
      );
      if(!ok) return;
    }

    if(btn){
      btn.dataset.saving='1';
      btn.disabled=true;
      btn.classList.add('is-saving');
      btn.textContent='建立中…';
    }

    const trip = {
      id:'trip_'+Date.now(),
      name:tripName,
      place,start,end,currency,people,
      expenses:[],pretrip:[],exchange:[],
      googleSheetStatus:'待串接',
      cloudStatus:getApiUrl() ? 'pending' : 'local'
    };

    state.trips.unshift(trip);
    persist();

    const check = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    const exists = check && Array.isArray(check.trips) && check.trips.some(t=>t.id===trip.id);
    if(!exists){
      throw new Error('LOCAL_SAVE_FAILED');
    }

    document.getElementById('tripPlace').value='';
    document.getElementById('tripStart').value='';
    document.getElementById('tripEnd').value='';
    openTrip(trip.id);

    if(getApiUrl()){
      syncTripCreation(trip).then(cloudOk=>{
        if(currentTrip && currentTrip.id===trip.id){
          showCloudResultModal(
            cloudOk,
            cloudOk
              ? '旅行已建立，並已同步建立 Google Sheet。'
              : '旅行已建立並保留在本機，但 Google Sheet 尚未同步成功，已加入待同步佇列。'
          );
        }
      }).catch(()=>{});
    }
  }catch(err){
    console.error('createTrip error:', err);
    alert('建立旅行時發生錯誤：' + (err && err.message ? err.message : '未知錯誤'));
  }finally{
    if(btn){
      btn.dataset.saving='0';
      btn.disabled=false;
      btn.classList.remove('is-saving');
      btn.textContent='建立旅行';
    }
  }
}

