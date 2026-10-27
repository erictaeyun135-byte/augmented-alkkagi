// =====================================================================
// 손님 화면 (온라인에서 방장이 아닌 사람)
// 방장이 초당 10번 정도 보내주는 화면 정보(view)를 받아서 그대로 그리고,
// 내 차례일 때만 알을 당기거나 클릭해서 "행동"을 방장에게 보냅니다.
// =====================================================================
class ViewScene extends Phaser.Scene {
  constructor() { super('view'); }

  create() {
    this.k = 1;
    this.sz = 0;
    this.boardGfx = this.add.graphics();
    this.decoGfx  = this.add.graphics();
    this.fxGfx    = this.add.graphics();
    this.stoneGfx = this.add.graphics();
    this.aimGfx   = this.add.graphics();
    this.texts    = [];          // 글자 묶음 (방장 화면 글자를 그대로 옮겨 그림)
    this.stones   = new Map();   // 알 id → { x, y, tx, ty, c, f, a }
    this.boomStart = 0;
    this.bdKey = '';
    this.dcKey = '';
    this.dragging = null;
    this.pendingUntil = 0;       // 행동을 보낸 직후 잠깐 중복 입력 막기
    this.v = null;

    this.scale.setGameSize(MENU_SIZE, MENU_SIZE);
    this.waitText = makeText(this, 500, 500, '방장 화면을 기다리는 중...', 32, '#aaaaaa');

    this.input.on('pointerdown', (p, over) => this.onDown(p, over));
    const release = (p) => this.onUp(p);
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    if (NET.view) this.applyView(NET.view);
  }

  myTurn() { return this.v && this.v.ac === NET.mySeat && Date.now() > this.pendingUntil; }

  send(a) {
    this.pendingUntil = Date.now() + 1500;
    NET.act(a);
  }

  onDown(p, over) {
    if (!this.myTurn()) return;
    if (over && over.some(o => o.name === 'poopBtn')) return;
    const v = this.v;
    if (v.md === 'click') { this.send({ t: 'click', x: p.worldX, y: p.worldY }); return; }
    if (v.md === 'next')  { this.send({ t: 'next' }); return; }
    if (v.md !== 'shoot') return;
    for (const id of v.sh || []) {
      const s = this.stones.get(String(id));
      if (s && Phaser.Math.Distance.Between(p.worldX, p.worldY, s.x, s.y) < STONE_RADIUS * 1.5) {
        this.dragging = { id, s };
        return;
      }
    }
  }

  onUp(p) {
    if (!this.dragging) return;
    const { id, s } = this.dragging;
    this.dragging = null;
    this.aimGfx.clear();
    if (!this.myTurn() || this.v.md !== 'shoot') return;
    const pull = pullVector({ x: s.x, y: s.y }, p);
    // 순서 미니게임에서 치는 알은 방장 쪽에선 'cur'(지금 치는 사람 알)
    this.send({ t: 'shoot', id: this.v.sc === 'order' ? 'cur' : id, x: pull.x, y: pull.y });
  }

  applyView(v) {
    if (!v || v.sc === 'pick') return;
    this.v = v;
    if (this.waitText) { this.waitText.destroy(); this.waitText = null; }
    if (v.mv) this.pendingUntil = 0;   // 방장이 처리했으면 다시 입력 가능

    // 화면 크기
    const sz = v.sz || MENU_SIZE;
    if (sz !== this.sz) { this.sz = sz; this.k = sz / MENU_SIZE; this.scale.setGameSize(sz, sz); }

    // 판
    const bdKey = v.bd ? v.bd.join(',') : '';
    if (bdKey !== this.bdKey) {
      this.bdKey = bdKey;
      this.boardGfx.clear();
      if (v.bd) {
        const [l, t, b, lines] = v.bd;
        this.boardGfx.fillStyle(0xd9a85b);
        this.boardGfx.fillRect(l, t, b, b);
        this.boardGfx.lineStyle(1, 0x8a6a35, 0.6);
        for (let i = 1; i < lines; i++) {
          const q = (b / lines) * i;
          this.boardGfx.lineBetween(l + q, t, l + q, t + b);
          this.boardGfx.lineBetween(l, t + q, l + b, t + q);
        }
      }
    }

    // 꾸밈 (과녁, 끝선 등)
    const dcKey = JSON.stringify(v.dc || []);
    if (dcKey !== this.dcKey) {
      this.dcKey = dcKey;
      this.decoGfx.clear();
      for (const d of v.dc || []) drawDeco(this.decoGfx, d);
    }

    // 알: 새 위치를 목표로 두고 update 에서 부드럽게 따라감
    const seen = new Set();
    for (const [id, x, y, c, f, a] of v.st || []) {
      const key = String(id);
      seen.add(key);
      const s = this.stones.get(key);
      if (!s || Phaser.Math.Distance.Between(s.x, s.y, x, y) > 250) {
        this.stones.set(key, { x, y, tx: x, ty: y, c, f, a });   // 처음 보거나 순간이동(부활 등)이면 바로 그 자리
      } else {
        Object.assign(s, { tx: x, ty: y, c, f, a });
      }
    }
    for (const key of [...this.stones.keys()]) if (!seen.has(key)) this.stones.delete(key);

    // 폭발: 방장 쪽에서 몇 ms 지났는지 받아서 내 시계로 맞춤
    if (v.bm) {
      const start = Date.now() - v.bm[2];
      if (!this.boom || this.boom.x !== v.bm[0] || this.boom.y !== v.bm[1]) this.boom = { x: v.bm[0], y: v.bm[1], start };
    } else {
      this.boom = null;
    }

    // 글자: 방장 화면 글자를 같은 자리에 같은 모양으로
    const tx = v.tx || [];
    while (this.texts.length < tx.length) {
      const t = this.add.text(0, 0, '', { fontFamily: FONT, align: 'center' }).setOrigin(0.5).setDepth(10);
      t.on('pointerdown', () => { if (this.myTurn() && t.name === 'poopBtn') this.send({ t: 'poop' }); });
      this.texts.push(t);
    }
    this.texts.forEach((t, i) => {
      const d = tx[i];
      if (!d) { t.setVisible(false); return; }
      const [x, y, str, px, color, stroke, alpha, name] = d;
      t.setVisible(true).setPosition(x, y).setText(str).setAlpha(alpha);
      t.setStyle({ fontFamily: FONT, fontSize: `${px}px`, color, align: 'center', stroke: '#000000', strokeThickness: stroke });
      t.name = name;
      if (name === 'poopBtn' && v.ac === NET.mySeat) t.setInteractive({ useHandCursor: true });
      else t.disableInteractive();
    });
  }

  update() {
    // 알 위치 부드럽게
    for (const s of this.stones.values()) {
      s.x += (s.tx - s.x) * 0.35;
      s.y += (s.ty - s.y) * 0.35;
    }
    this.fxGfx.clear();
    if (this.v && this.v.pp) for (const [x, y] of this.v.pp) drawPoop(this.fxGfx, x, y);
    if (this.boom) {
      const t = (Date.now() - this.boom.start) / 400;
      if (t < 1) {
        this.fxGfx.fillStyle(0xff6600, 0.5 * (1 - t));
        this.fxGfx.fillCircle(this.boom.x, this.boom.y, BOMB_RADIUS * t);
      }
    }
    this.stoneGfx.clear();
    for (const s of this.stones.values()) drawStoneFull(this.stoneGfx, s.x, s.y, s.c, s.f || '', s.a == null ? 1 : s.a);
    if (this.dragging) drawAim(this.aimGfx, { x: this.dragging.s.x, y: this.dragging.s.y }, this.input.activePointer);
  }
}
