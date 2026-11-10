# 캐릭터 다시 그리기 프롬프트 (2026-11-09)

이 폴더의 `<동물>.png`(지금 그림을 칸별로 모은 참고 그림)를 GPT에 같이 올리고, 칸 수에 맞는 프롬프트에 `{ANIMAL}` 줄을 바꿔 넣는다.
받은 그림은 `experiments/2-5d-crocodile/assets/<동물>/received_v3/`에 두면 칸을 잘라 지금 그림 자리에 맞춰 넣는다(여우가 첫 예).

열: 왼쪽 = 정면(아래로 걸어올 때) · 가운데 = 오른쪽을 봄(옆모습) · 오른쪽 = 뒤돌아섬(위로 갈 때). 왼쪽 방향은 옆모습을 뒤집어 쓴다.

## 공통 스타일 (모든 프롬프트 끝에 붙인다)

```
Style: cute cozy premium mobile puzzle game character, soft hand-painted 3D toy look like a high-end plush or vinyl figure, short soft fur (or smooth skin for reptiles and insects) with subtle detail, gentle rim light, soft ambient occlusion, rich colors, glossy expressive eyes with highlights, small rosy blush, clean subtle darker outline. Chunky rounded-cube block shapes exactly like the reference, every block the same width. Same lighting for every view, light from the top front, left-right symmetric. Camera looking down at about 58 degrees, no side rotation, the same for every view. Every block stands on its own short feet that touch the bottom of the block with no gap (except legless animals). Each view centered in its own cell with empty space around it. Transparent background, no floor, no shadow, no text, no grid lines.
```

## 1칸 동물 (병아리·펭귄·앵무새) — 1행 3칸

```
Redraw the attached character sheet in much higher quality as ONE row of three views: left = facing the viewer, middle = facing right (side profile), right = facing away (back). {ANIMAL}
```

## 2칸 동물 (소·돼지·여우·호랑이·허스키) — 2행 3칸

```
Redraw the attached character sheet in much higher quality. Keep the same 3x2 layout and the same six views in the same places. {ANIMAL}

Top row = the HEAD block: left = facing the viewer (front, the face), middle = facing right (side profile, standing on two short feet under the block), right = facing away (back of the head).
Bottom row = the REAR BODY block (the back half of the animal, joined to the head): left = seen from the FRONT as the animal walks toward the viewer: its front face joins the head, so it is plain body color with no face and no tail on it, and the tail is on the far side pointing away, so only the tail tip peeks up above the top back edge; middle = facing right (side profile, the tail sticking out to the left); right = seen from BEHIND (the tail in full view on the back face).
```

## 3칸 동물 (뱀·애벌레·닥스훈트·악어) — 3행 3칸

```
Redraw the attached character sheet in much higher quality. Keep the same 3x3 layout and the same nine views in the same places. {ANIMAL}

Top row = the HEAD block: left = facing the viewer (front, the face), middle = facing right (side profile, standing on two short feet under the block), right = facing away (back of the head).
Middle row = the MIDDLE BODY block (joined to the head in front and the tail block behind, no face, no tail): left = seen from the front, middle = facing right (side), right = seen from behind. Front and back look the same.
Bottom row = the TAIL block (the back end): left = seen from the FRONT as the animal walks toward the viewer: plain body color, the tail on the far side pointing away, only its tip peeking up above the top back edge; middle = facing right (side profile, the tail sticking out to the left); right = seen from BEHIND (the tail in full view).
```

## {ANIMAL} 줄

| 동물 | 넣을 문장 |
|---|---|
| 여우 fox | `The character is a cute orange fox with a cream-white face, chest and fluffy tail tip, pointed ears.` |
| 소 cow | `The character is a cute white cow with black spots, small brown horns, a pink snout and dark hooves.` |
| 돼지 pig | `The character is a cute pink pig with a round snout, small floppy ears and a curly tail.` |
| 호랑이 tiger | `The character is a cute golden-orange tiger with dark brown stripes, a cream muzzle and a striped tail.` |
| 허스키 husky | `The character is a cute grey and white husky dog with blue eyes, pointed ears and a curled fluffy tail.` |
| 병아리 chick | `The character is a cute yellow chick with an orange beak and feet, tiny wings and a small tuft on top.` |
| 펭귄 penguin | `The character is a cute navy-black penguin with a white belly, an orange beak and orange feet.` |
| 앵무새 parrot | `The character is a cute red parrot with blue, green and yellow wing feathers and a curved beak.` |
| 뱀 snake | `The character is a cute green snake with a pale belly and soft pattern; it has no legs, the blocks rest on the ground.` |
| 애벌레 caterpillar | `The character is a cute green caterpillar with a round face, small antennae and many tiny feet.` |
| 닥스훈트 dachshund | `The character is a cute long brown dachshund with long floppy ears and short legs.` |
| 악어 crocodile | `The character is a cute green crocodile with a long rounded snout, small bumps on its back and a pale belly; short stubby legs.` |

지금 그림의 색과 생김새가 표와 다르면(예: 닥스훈트 폴더의 그림은 노랑·파랑 벌레 모양) 참고 그림 쪽을 따르거나 이 문장을 원하는 모습으로 고친다.
