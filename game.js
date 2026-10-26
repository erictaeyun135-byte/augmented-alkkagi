// ===== 조절용 숫자 =====
const STONE_RADIUS = 14;    // 알 반지름
const BOARD_RATIO  = 28;    // 판 한 변 = 알 지름 × 이 값
const MAX_PULL     = 150;   // 최대로 당길 수 있는 거리
const POWER        = 0.12;  // 당긴 거리 → 발사 속도 비율
const FRICTION_AIR = 0.02;  // 클수록 알이 빨리 멈춤
const STOP_SPEED   = 0.08;  // 이보다 느리면 멈춘 것으로 봄

const GAME_SIZE  = 1000;
const BOARD_SIZE = STONE_RADIUS * 2 * BOARD_RATIO;
const COLOR_NAME = { black: '흑', white: '백' };

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    this.left = (GAME_SIZE - BOARD_SIZE) / 2;
    this.top  = (GAME_SIZE - BOARD_SIZE) / 2;

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

    this.stoneGfx = this.add.graphics();
    this.aimGfx   = this.add.graphics();
    this.dragging = null;

    // 게임 상태
    this.turn     = 'black';  // 흑 먼저
    this.moving   = false;    // 알이 굴러가는 중인지
    this.shotTime = 0;
    this.gameOver = false;

    this.infoText = this.add.text(GAME_SIZE / 2, this.top / 2, '', {
      fontSize: '36px', color: '#ffffff'
    }).setOrigin(0.5);
    this.showTurn();

    // 새총 조작: 내 차례, 내 알만, 알이 다 멈췄을 때만
    this.input.on('pointerdown', (p) => {
      if (this.moving || this.gameOver) return;
      this.dragging = this.stones.find(s =>
        s.alive && s.color === this.turn &&
        Phaser.Math.Distance.Between(p.worldX, p.worldY, s.body.position.x, s.body.position.y) < STONE_RADIUS * 1.5
      ) || null;
    });
    this.input.on('pointerup', (p) => {
      if (!this.dragging) return;
      const pull = this.getPull(p);
      this.matter.body.setVelocity(this.dragging.body, { x: pull.x * POWER, y: pull.y * POWER });
      this.dragging = null;
      this.aimGfx.clear();
      this.moving = true;
      this.shotTime = this.time.now;
    });
  }

  makeStone(x, y, color) {
    const body = this.matter.add.circle(x, y, STONE_RADIUS, {
      restitution: 0.9, friction: 0, frictionStatic: 0, frictionAir: FRICTION_AIR
    });
    return { body, color, alive: true };
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

  count(color) {
    return this.stones.filter(s => s.alive && s.color === color).length;
  }

  showTurn() {
    this.infoText.setText(`${COLOR_NAME[this.turn]} 차례`);
  }

  endTurn() {
    const b = this.count('black');
    const w = this.count('white');
    if (b === 0 && w === 0) return this.finish('무승부!');
    if (b === 0) return this.finish('백 승리!');
    if (w === 0) return this.finish('흑 승리!');
    this.turn = this.turn === 'black' ? 'white' : 'black';
    this.showTurn();
  }

  finish(msg) {
    this.gameOver = true;
    this.infoText.setText(`${msg}  (클릭하면 다시 시작)`);
    this.input.once('pointerdown', () => this.scene.restart());
  }

  update() {
    // 1) 판 밖으로 나간 알 탈락
    for (const s of this.stones) {
      if (s.alive && this.isOut(s)) {
        s.alive = false;
        this.matter.world.remove(s.body);
      }
    }

    // 2) 모든 알이 멈추면 턴 종료
    if (this.moving && this.time.now - this.shotTime > 200) {
      const allStopped = this.stones.every(s => !s.alive || s.body.speed < STOP_SPEED);
      if (allStopped) {
        for (const s of this.stones) {
          if (s.alive) this.matter.body.setVelocity(s.body, { x: 0, y: 0 });
        }
        this.moving = false;
        this.endTurn();
      }
    }

    // 3) 살아있는 알 그리기
    this.stoneGfx.clear();
    for (const s of this.stones) {
      if (!s.alive) continue;
      const { x, y } = s.body.position;
      this.stoneGfx.fillStyle(s.color === 'black' ? 0x222222 : 0xf2f2f2);
      this.stoneGfx.fillCircle(x, y, STONE_RADIUS);
      this.stoneGfx.lineStyle(2, s.color === 'black' ? 0x555555 : 0xaaaaaa);
      this.stoneGfx.strokeCircle(x, y, STONE_RADIUS);
    }

    // 4) 조준선: 고무줄처럼 마우스 쪽으로만, 최대 힘이면 노랑
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

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1e1e1e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_SIZE, height: GAME_SIZE },
  physics: { default: 'matter', matter: { gravity: { x: 0, y: 0 } } },
  scene: GameScene
});