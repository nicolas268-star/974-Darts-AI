// Original, schematic game map. Regions are playing areas, not national borders.
// CONNECTED_V1 adjacency is fixed for saved games; change version for new rules.
export const CONQUEST_REGIONS = [
  { id: 1, name: "Alaska", x: 118, y: 115, path: "M55 112 76 92 118 91 148 72 165 70 165 110 155 143 130 154 98 140 68 148 73 130Z" },
  { id: 2, name: "Canada Ouest", x: 208, y: 120, path: "M165 70 255 75 252 162 170 165 155 143 165 110Z" },
  { id: 3, name: "Canada Est", x: 302, y: 133, path: "M255 75 310 60 352 85 341 109 378 124 357 163 318 177 298 205 252 162Z" },
  { id: 4, name: "Groenland", x: 408, y: 95, path: "M371 59 403 37 452 48 464 79 438 115 422 153 400 169 388 131 374 111Z" },
  { id: 5, name: "Amérique Ouest", x: 211, y: 207, path: "M170 165 252 162 255 245 213 247 177 210Z" },
  { id: 6, name: "Amérique Est", x: 288, y: 224, path: "M252 162 298 205 340 212 327 240 294 264 255 245Z" },
  { id: 7, name: "Amérique centrale", x: 264, y: 281, path: "M213 247 255 245 294 264 281 279 274 307 298 322 307 342 284 341 261 319 248 294 231 291Z" },
  { id: 8, name: "Andes", x: 319, y: 403, path: "M284 341 307 342 344 352 338 404 350 454 335 481 331 512 315 472 307 430 290 384Z" },
  { id: 9, name: "Amazonie", x: 377, y: 385, path: "M307 342 336 328 387 350 423 387 397 423 366 460 350 454 338 404 344 352Z" },
  { id: 10, name: "Patagonie", x: 343, y: 496, path: "M350 454 366 460 358 500 351 527 333 548 324 522 331 512 335 481Z" },
  { id: 11, name: "Europe Ouest", x: 557, y: 180, path: "M523 147 551 123 560 96 579 87 591 116 583 157 600 177 586 218 552 237 525 217 535 187 518 173Z" },
  { id: 12, name: "Europe Est", x: 623, y: 166, path: "M579 87 638 96 658 131 669 162 649 203 620 210 608 240 586 218 600 177 583 157 591 116Z" },
  { id: 13, name: "Afrique Nord", x: 586, y: 282, path: "M526 265 553 245 586 250 629 245 660 267 650 311 624 322 582 316 536 324 511 302Z" },
  { id: 14, name: "Afrique Ouest", x: 553, y: 348, path: "M511 302 536 324 582 316 595 365 575 389 541 374 521 352Z" },
  { id: 15, name: "Afrique Sud & Est", x: 615, y: 383, path: "M582 316 624 322 650 311 651 341 682 336 663 364 646 384 624 430 597 460 580 421 575 389 595 365Z M672 410 682 417 671 447 662 451 663 427Z" },
  { id: 16, name: "Sibérie", x: 794, y: 112, path: "M638 96 698 67 795 70 853 50 950 73 972 102 947 129 982 151 946 185 885 171 835 186 788 156 725 166 669 162 658 131Z" },
  { id: 17, name: "Asie Est", x: 874, y: 219, path: "M788 156 835 186 885 171 946 185 944 216 919 242 900 269 866 281 855 299 832 250 791 218Z M958 225 966 230 960 250 948 265 945 253Z" },
  { id: 18, name: "Asie centrale", x: 720, y: 208, path: "M669 162 725 166 788 156 791 218 753 255 720 249 696 273 671 250 658 220 649 203Z" },
  { id: 19, name: "Asie Sud", x: 789, y: 278, path: "M720 249 753 255 791 218 832 250 855 299 874 315 860 337 828 305 810 276 800 319 774 332 751 292Z M832 350 843 351 862 360 882 364 885 372 859 371 842 363Z" },
  { id: 20, name: "Océanie", x: 928, y: 423, path: "M861 395 886 376 921 377 934 355 949 384 979 391 995 424 981 462 948 477 920 459 890 465 864 439Z M1011 445 1020 451 1008 471 1001 467Z M1001 476 1007 482 995 496 987 494Z" },
] as const;

export const CONQUEST_LAND_LINKS: readonly (readonly [number, number])[] = [
  [1,2], [2,3], [2,5], [3,6], [5,6], [5,7], [6,7], [7,8], [8,9], [8,10], [9,10],
  [11,12], [12,16], [12,18], [13,14], [13,15], [14,15], [16,17], [16,18], [17,18], [17,19], [18,19],
];
export const CONQUEST_SEA_LINKS = [
  { a: 3, b: 4, path: "M350 113 Q363 86 387 110" },
  { a: 4, b: 11, path: "M437 126 Q485 110 541 155" },
  { a: 9, b: 14, path: "M411 402 Q475 420 529 354" },
  { a: 11, b: 13, path: "M547 228 Q527 247 552 263" },
  { a: 12, b: 13, path: "M618 216 Q640 232 632 258" },
  { a: 15, b: 18, path: "M668 349 Q716 321 696 258" },
  { a: 19, b: 20, path: "M857 323 Q902 321 927 385" },
] as const;
export const CONQUEST_LINKS: readonly (readonly [number, number])[] = [
  ...CONQUEST_LAND_LINKS, ...CONQUEST_SEA_LINKS.map(({ a, b }) => [a, b] as const),
];
export function conquestNeighbors(target: number): number[] {
  return CONQUEST_LINKS.flatMap(([a,b]) => a === target ? [b] : b === target ? [a] : []).sort((a,b) => a-b);
}
