// ===== 조절용 숫자 (플레이해보며 바꿀 것들) =====
const STONE_RADIUS = 14;    // 알 반지름
const BOARD_RATIO  = 28;    // 판 한 변 = 알 지름 × 이 값
const MAX_PULL     = 150;   // 최대로 당길 수 있는 거리
const POWER        = 0.12;  // 당긴 거리 → 발사 속도 비율
const FRICTION_AIR = 0.02;  // 클수록 알이 빨리 멈춤
const STOP_SPEED   = 0.08;  // 이보다 느리면 멈춘 것으로 봄
const WINS_NEEDED  = 2;     // 3판 2선승

// ===== 증강 수치 =====
const IRON_MASS       = 2;      // 무쇠알 무게 배수
const BANANA_FRICTION = 0.004;  // 바나나 알의 미끄러움 (작을수록 미끄러움)
const BOMB_RADIUS     = 170;    // 폭발 범위
const BOMB_POWER      = 14;     // 폭발 힘
const POOP_RADIUS     = 18;     // 똥 크기
const RUBBER_COUNT    = 2;      // 고무 테두리가 붙는 알 개수
const RUBBER_BOUNCE   = 1.2;    // 고무 테두리로 튕겨 들어오는 속도 (얼마나 세게 나갔든 항상 같음, 1.2 ≈ 알 2개 거리)

// ===== 고정값 =====
const GAME_SIZE  = 1000;
const BOARD_SIZE = STONE_RADIUS * 2 * BOARD_RATIO;
const MARGIN     = (GAME_SIZE - BOARD_SIZE) / 2;
const COLOR_NAME = { black: '흑', white: '백' };
const FONT       = 'Malgun Gothic, sans-serif';
const other      = (c) => (c === 'black' ? 'white' : 'black');

// ===== 경기 전체 상태 (판이 바뀌어도 유지됨) =====
let match = null;
function newMatch() {
  match = {
    round: 1,
    wins: { black: 0, white: 0 },
    augs: { black: [], white: [] },  // 각자 가진 증강 키 목록
    lastLoser: null,                 // 직전 판 패자 (다시 뽑기 + 선공)
  };
}
newMatch();

function hasAug(color, key) {
  return match.augs[color].includes(key);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =====================================================================
// 증강 선택 화면: 흑 → 백 순서로 무작위 3개 중 1개 선택
// =====================================================================
class PickScene extends Phaser.Scene {
  constructor() { super('pick'); }

  create() {
    this.order = ['black', 'white'];
    this.idx = 0;
    this.startPick();
  }

  startPick() {
    this.color = this.order[this.idx];
    this.rerollLeft = match.lastLoser === this.color ? 1 : 0;
    this.options = this.draw([]);
    this.render();
  }

  // 아직 안 가진 증강 중 무작위 3개 (exclude는 가능하면 피함)
  draw(exclude) {
    const notOwned = Object.keys(AUGMENTS).filter(k => !hasAug(this.color, k));
    const fresh = shuffle(notOwned.filter(k => !exclude.includes(k)));
    const rest  = shuffle(notOwned.filter(k => exclude.includes(k)));
    return [...fresh, ...rest].slice(0, 3);
  }

  render() {
    if (this.ui) this.ui.destroy(true);
    this.ui = this.add.container(0, 0);
    const name = COLOR_NAME[this.color];

    this.ui.add(this.add.text(GAME_SIZE / 2, 90,
      `${match.round}판째   흑 ${match.wins.black} : ${match.wins.white} 백`,
      { fontFamily: FONT, fontSize: '28px', color: '#bbbbbb' }).setOrigin(0.5));
    this.ui.add(this.add.text(GAME_SIZE / 2, 150,
      `${name}, 증강을 고르세요`,
      { fontFamily: FONT, fontSize: '44px', color: '#ffffff' }).setOrigin(0.5));

    // 카드 3장
    this.options.forEach((key, i) => {
      const x = GAME_SIZE / 2 + (i - 1) * 290;
      const y = 470;
      const card = this.add.rectangle(x, y, 250, 380, 0x2d2d3a)
        .setStrokeStyle(3, 0x777777)
        .setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setStrokeStyle(5, 0xffcc00));
      card.on('pointerout',  () => card.setStrokeStyle(3, 0x777777));
      card.on('pointerdown', () => this.choose(key));
      this.ui.add(card);
      this.ui.add(this.add.text(x, y - 130, AUGMENTS[key].name,
        { fontFamily: FONT, fontSize: '34px', color: '#ffcc00' }).setOrigin(0.5));
      this.ui.add(this.add.text(x, y + 30, AUGMENTS[key].desc,
        { fontFamily: FONT, fontSize: '22px', color: '#eeeeee', align: 'center' }).setOrigin(0.5));
    });

    // 다시 뽑기 (직전 판 패자만, 1번)
    if (this.rerollLeft > 0) {
      const btn = this.add.text(GAME_SIZE / 2, 720, '[ 다시 뽑기 (1회) ]',
        { fontFamily: FONT, fontSize: '30px', color: '#66ccff' })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        this.rerollLeft = 0;
        this.options = this.draw(this.options);
        this.render();
      });
      this.ui.add(btn);
    }

    // 가진 증강 목록
    const list = (c) => match.augs[c].map(k => AUGMENTS[k].name).join(', ') || '없음';
    this.ui.add(this.add.text(GAME_SIZE / 2, 820,
      `흑: ${list('black')}\n백: ${list('white')}`,
      { fontFamily: FONT, fontSize: '24px', color: '#aaaaaa', align: 'center' }).setOrigin(0.5));
  }

  choose(key) {
    match.augs[this.color].push(key);
    this.idx++;
    if (this.idx < this.order.length) this.startPick();
    else this.scene.start('game');
  }
}

// =====================================================================
// 알까기 한 판
// =====================================================================
class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    this.left = MARGIN;
    this.top  = MARGIN;

    // 판 그리기
    const g = this.add.graphics();
    g.fillStyle(0xd9a85b);
    g.fillRect(this.left, this.top, BOARD_SIZE, BOARD_SIZE);
    g.lineStyle(1, 0x8a6a35, 0.6);
    for (let i = 1; i < 19; i++) {
      const p = (BOARD_SIZE / 19) * i;
      g.lineBetween(this.left + p, this.top, this.left + p, this.top + BOARD_SIZE);
      g.lineBetween(this.left, this.top + p, this.left + BOARD_SIZE, this.top + p);
    }

    // 알 만들기: 흑은 아래, 백은 위
    this.stones = [];
    for (let i = 0; i < 5; i++) {
      const x = this.left + (BOARD_SIZE / 6) * (i + 1);
      this.stones.push(this.makeStone(x, this.top + BOARD_SIZE * 0.85, 'black'));
      this.stones.push(this.makeStone(x, this.top + BOARD_SIZE * 0.15, 'white'));
    }

    this.poops = [];
    this.boom = null;
    this.reviveLeft = { black: 0, white: 0 };
    this.poopLeft   = { black: 0, white: 0 };
    this.applyAugments();

    this.stoneGfx = this.add.graphics();
    this.aimGfx   = this.add.graphics();
    this.fxGfx    = this.add.graphics();

    // 게임 상태
    this.turn        = match.lastLoser || 'black';  // 직전 판 패자가 선공
    this.dragging    = null;
    this.moving      = false;
    this.shotTime    = 0;
    this.shotStone   = null;
    this.knocked     = false;  // 이번 샷에 상대 알을 떨어뜨렸는지
    this.exploded    = false;  // 이번 샷에 폭탄이 터졌는지
    this.placingPoop = false;
    this.gameOver    = false;

    // 화면 글자
    this.infoText = this.add.text(GAME_SIZE / 2, MARGIN / 2, '',
      { fontFamily: FONT, fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.augText = this.add.text(GAME_SIZE / 2, this.top + BOARD_SIZE + 30, '',
      { fontFamily: FONT, fontSize: '20px', color: '#aaaaaa', align: 'center' }).setOrigin(0.5);
    this.poopBtn = this.add.text(GAME_SIZE / 2, this.top + BOARD_SIZE + 75, '',
      { fontFamily: FONT, fontSize: '26px', color: '#c8955a' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.poopBtn.on('pointerdown', () => {
      if (this.canPlacePoop()) this.placingPoop = !this.placingPoop;
      this.updateHud();
    });
    this.flashText = this.add.text(GAME_SIZE / 2, GAME_SIZE / 2, '',
      { fontFamily: FONT, fontSize: '64px', color: '#ffffff', stroke: '#000000', strokeThickness: 8 })
      .setOrigin(0.5).setAlpha(0);
    this.updateHud();

    // 마우스 조작
    this.input.on('pointerdown', (p) => {
      if (this.moving || this.gameOver) return;
      if (this.placingPoop) {
        this.tryPlacePoop(p.worldX, p.worldY);
        return;
      }
      this.dragging = this.stones.find(s =>
        s.alive && s.color === this.turn &&
        Phaser.Math.Distance.Between(p.worldX, p.worldY, s.body.position.x, s.body.position.y) < STONE_RADIUS * 1.5
      ) || null;
    });
    this.input.on('pointerup', (p) => {
      if (!this.dragging) return;
      const pull = this.getPull(p);
      this.matter.body.setVelocity(this.dragging.body, { x: pull.x * POWER, y: pull.y * POWER });
      this.shotStone = this.dragging;
      this.dragging  = null;
      this.aimGfx.clear();
      this.moving   = true;
      this.knocked  = false;
      this.exploded = false;
      this.shotTime = this.time.now;
      this.updateHud();
    });
  }

  makeStone(x, y, color) {
    const body = this.matter.add.circle(x, y, STONE_RADIUS, {
      restitution: 0.9, friction: 0, frictionStatic: 0, frictionAir: FRICTION_AIR
    });
    return { body, color, alive: true, home: { x, y }, bounceLeft: 0, banana: false, bomb: false, iron: false };
  }

  myStones(color) {
    return this.stones.filter(s => s.alive && s.color === color);
  }

  // 판 시작할 때 증강 효과 적용
  applyAugments() {
    for (const color of ['black', 'white']) {
      const mine = this.myStones(color);
      if (hasAug(color, 'iron')) {
        for (const s of mine) {
          this.matter.body.setMass(s.body, s.body.mass * IRON_MASS);
          s.iron = true;
        }
      }
      if (hasAug(color, 'rubber')) {
        for (const s of shuffle(mine).slice(0, RUBBER_COUNT)) s.bounceLeft = 1;
      }
      if (hasAug(color, 'banana')) {
        const target = Phaser.Utils.Array.GetRandom(this.myStones(other(color)).filter(s => !s.banana));
        if (target) { target.banana = true; target.body.frictionAir = BANANA_FRICTION; }
      }
      if (hasAug(color, 'bomb')) {
        Phaser.Utils.Array.GetRandom(mine).bomb = true;
      }
      if (hasAug(color, 'revive')) this.reviveLeft[color] = 1;
      if (hasAug(color, 'poop'))   this.poopLeft[color]   = 1;
    }
  }

  getPull(p) {
    const s = this.dragging.body.position;
    const v = new Phaser.Math.Vector2(s.x - p.worldX, s.y - p.worldY);
    if (v.length() > MAX_PULL) v.setLength(MAX_PULL);
    return v;
  }

  isOut(s) {
    const { x, y } = s.body.position;
    return x < this.left || x > this.left + BOARD_SIZE || y < this.top || y > this.top + BOARD_SIZE;
  }

  isInsideBoard(x, y) {
    return x > this.left && x < this.left + BOARD_SIZE && y > this.top && y < this.top + BOARD_SIZE;
  }

  // ----- 똥 -----
  canPlacePoop() {
    return !this.moving && !this.gameOver && this.poopLeft[this.turn] > 0;
  }

  tryPlacePoop(x, y) {
    if (!this.isInsideBoard(x, y)) return;  // 판 밖 클릭은 무시 (설치 모드 유지)
    const onStone = this.stones.some(s => s.alive &&
      Phaser.Math.Distance.Between(x, y, s.body.position.x, s.body.position.y) < POOP_RADIUS + STONE_RADIUS);
    if (onStone) return;                    // 알 위에는 못 놓음
    this.poops.push({ x, y });
    this.poopLeft[this.turn]--;
    this.placingPoop = false;
    this.updateHud();
  }

  // ----- 폭탄 -----
  explode(s) {
    this.exploded = true;
    s.bomb = false;
    const { x, y } = s.body.position;
    for (const o of this.stones) {
      if (!o.alive || o === s) continue;
      const dx = o.body.position.x - x;
      const dy = o.body.position.y - y;
      const d  = Math.hypot(dx, dy);
      if (d > 0 && d < BOMB_RADIUS) {
        const f = BOMB_POWER * (1 - d / BOMB_RADIUS);
        this.matter.body.setVelocity(o.body, { x: dx / d * f, y: dy / d * f });
      }
    }
    this.boom = { x, y, start: this.time.now };
    this.flash('펑!');
    // 폭발로 다시 굴러가니, 다 멈출 때까지 다시 기다림
    this.moving   = true;
    this.shotTime = this.time.now;
  }

  // ----- 판 밖으로 나간 알 처리 (고무 → 부활 → 탈락 순서) -----
  handleOut(s) {
    const b = s.body;
    if (s.bounceLeft > 0) {
      s.bounceLeft = 0;
      let { x, y } = b.position;
      let vx = b.velocity.x, vy = b.velocity.y;
      const L = this.left, R = this.left + BOARD_SIZE, T = this.top, B = this.top + BOARD_SIZE;
      vx *= 0.2; vy *= 0.2;  // 옆으로 미끄러지던 힘도 대부분 없앰
      if (x < L) { x = L + 1; vx =  RUBBER_BOUNCE; }
      if (x > R) { x = R - 1; vx = -RUBBER_BOUNCE; }
      if (y < T) { y = T + 1; vy =  RUBBER_BOUNCE; }
      if (y > B) { y = B - 1; vy = -RUBBER_BOUNCE; }
      this.matter.body.setPosition(b, { x, y });
      this.matter.body.setVelocity(b, { x: vx, y: vy });
      return;
    }
    if (this.reviveLeft[s.color] > 0) {
      this.reviveLeft[s.color]--;
      this.matter.body.setPosition(b, { x: s.home.x, y: s.home.y });
      this.matter.body.setVelocity(b, { x: 0, y: 0 });
      this.flash(`${COLOR_NAME[s.color]} 부활!`);
      return;
    }
    s.alive = false;
    this.matter.world.remove(b);
    if (s.color !== this.turn) this.knocked = true;
  }

  count(color) {
    return this.myStones(color).length;
  }

  endTurn() {
    const b = this.count('black');
    const w = this.count('white');
    if (b === 0 && w === 0) return this.endRound(null);
    if (b === 0) return this.endRound('white');
    if (w === 0) return this.endRound('black');

    if (hasAug(this.turn, 'again') && this.knocked) {
      this.flash('한 번 더!');
    } else {
      this.turn = other(this.turn);
    }
    this.placingPoop = false;
    this.updateHud();
  }

  endRound(winner) {
    this.gameOver = true;
    this.placingPoop = false;
    let msg;
    if (winner) {
      match.wins[winner]++;
      match.lastLoser = other(winner);
    } else {
      match.lastLoser = null;
    }

    if (winner && match.wins[winner] >= WINS_NEEDED) {
      msg = `${COLOR_NAME[winner]} 최종 승리!  (클릭하면 새 경기)`;
      this.input.once('pointerdown', () => { newMatch(); this.scene.start('pick'); });
    } else {
      msg = `${winner ? COLOR_NAME[winner] + ' 승리' : '무승부'}!  (클릭하면 다음 판)`;
      match.round++;
      this.input.once('pointerdown', () => this.scene.start('pick'));
    }
    this.updateHud();
    this.infoText.setText(msg);
  }

  flash(msg) {
    this.tweens.killTweensOf(this.flashText);
    this.flashText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.flashText, alpha: 0, delay: 500, duration: 700 });
  }

  updateHud() {
    this.infoText.setText(
      `${match.round}판   흑 ${match.wins.black} : ${match.wins.white} 백   ·   ${COLOR_NAME[this.turn]} 차례`);
    const list = (c) => match.augs[c].map(k => AUGMENTS[k].name).join(', ') || '없음';
    this.augText.setText(`흑: ${list('black')}     |     백: ${list('white')}`);

    if (this.placingPoop) {
      this.poopBtn.setText('판 위를 클릭해 똥을 놓으세요  (취소: 여기 클릭)');
    } else if (this.canPlacePoop()) {
      this.poopBtn.setText('[ 똥 설치하기 ]');
    } else {
      this.poopBtn.setText('');
    }
  }

  update() {
    // 1) 똥 밟으면 그 자리에서 멈춤 (똥은 한 번 쓰면 사라짐)
    for (const s of this.stones) {
      if (!s.alive || s.body.speed < STOP_SPEED) continue;
      const hit = this.poops.findIndex(p =>
        Phaser.Math.Distance.Between(p.x, p.y, s.body.position.x, s.body.position.y) < POOP_RADIUS);
      if (hit >= 0) {
        this.matter.body.setVelocity(s.body, { x: 0, y: 0 });
        this.poops.splice(hit, 1);
        this.flash('똥 밟았다!');
      }
    }

    // 2) 판 밖으로 나간 알 처리
    for (const s of this.stones) {
      if (s.alive && this.isOut(s)) this.handleOut(s);
    }

    // 3) 모든 알이 멈추면: 폭탄 확인 → 턴 종료
    if (this.moving && this.time.now - this.shotTime > 200) {
      const allStopped = this.stones.every(s => !s.alive || s.body.speed < STOP_SPEED);
      if (allStopped) {
        for (const s of this.stones) {
          if (s.alive) this.matter.body.setVelocity(s.body, { x: 0, y: 0 });
        }
        const s = this.shotStone;
        if (s && s.alive && s.bomb && !this.exploded) {
          this.explode(s);
        } else {
          this.moving = false;
          this.endTurn();
        }
      }
    }

    // 4) 그리기
    this.draw();
  }

  draw() {
    // 똥
    this.fxGfx.clear();
    for (const p of this.poops) {
      this.fxGfx.fillStyle(0x6b4226);
      this.fxGfx.fillCircle(p.x, p.y + 5, POOP_RADIUS * 0.9);
      this.fxGfx.fillCircle(p.x, p.y - 4, POOP_RADIUS * 0.65);
      this.fxGfx.fillCircle(p.x, p.y - 11, POOP_RADIUS * 0.4);
    }
    // 폭발 효과
    if (this.boom) {
      const t = (this.time.now - this.boom.start) / 400;
      if (t < 1) {
        this.fxGfx.fillStyle(0xff6600, 0.5 * (1 - t));
        this.fxGfx.fillCircle(this.boom.x, this.boom.y, BOMB_RADIUS * t);
      } else {
        this.boom = null;
      }
    }

    // 알
    this.stoneGfx.clear();
    for (const s of this.stones) {
      if (!s.alive) continue;
      const { x, y } = s.body.position;
      if (s.bounceLeft > 0) {                       // 고무 테두리: 파란 바깥 고리
        this.stoneGfx.lineStyle(3, 0x33aaff);
        this.stoneGfx.strokeCircle(x, y, STONE_RADIUS + 4);
      }
      this.stoneGfx.fillStyle(s.color === 'black' ? 0x222222 : 0xf2f2f2);
      this.stoneGfx.fillCircle(x, y, STONE_RADIUS);
      if (s.iron) {                                 // 무쇠알: 두꺼운 쇠 테두리 + 안쪽 고리
        const steel = s.color === 'black' ? 0xa8a8a8 : 0x666666;  // 고무(파랑)와 헷갈리지 않게 무채색
        this.stoneGfx.lineStyle(4, steel);
        this.stoneGfx.strokeCircle(x, y, STONE_RADIUS - 1);
        this.stoneGfx.lineStyle(2, steel);
        this.stoneGfx.strokeCircle(x, y, STONE_RADIUS - 6);
      } else {
        this.stoneGfx.lineStyle(2, s.color === 'black' ? 0x555555 : 0xaaaaaa);
        this.stoneGfx.strokeCircle(x, y, STONE_RADIUS);
      }
      if (s.banana) {                               // 바나나: 노란 점
        this.stoneGfx.fillStyle(0xffdd00);
        this.stoneGfx.fillCircle(x, y, 5);
      }
      if (s.bomb) {                                 // 폭탄: 빨간 점
        this.stoneGfx.fillStyle(0xff2222);
        this.stoneGfx.fillCircle(x, y, 5);
      }
    }

    // 조준선: 고무줄처럼 마우스 쪽으로만, 최대 힘이면 노랑
    if (this.dragging) {
      const p = this.input.activePointer;
      const s = this.dragging.body.position;
      const v = this.getPull(p);
      const isMax = v.length() >= MAX_PULL - 0.5;
      this.aimGfx.clear();
      this.aimGfx.lineStyle(3, isMax ? 0xffcc00 : 0xff4444, 0.9);
      this.aimGfx.lineBetween(s.x, s.y, s.x - v.x, s.y - v.y);
    }
  }
}

// window.game: 개발 중 브라우저에서 상태를 확인하기 위한 연결
window.game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1e1e1e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_SIZE, height: GAME_SIZE },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 0 } } },
  scene: [PickScene, GameScene]
});
