export type CellSelectionPhase = 1 | 2 | 3;

export type CellSelectionPoint = {
  row: number;
  col: number;
};

/** F5 반복 횟수에 따른 셀 선택 동작을 사용자에게 설명하는 단일 문구 소유자. */
export function cellSelectionPhaseLabel(phase: CellSelectionPhase): string {
  switch (phase) {
    case 1:
      return 'Cell selected · Use arrow keys to move';
    case 2:
      return 'Cell range selected · Use arrow keys to extend';
    case 3:
      return 'Entire table selected';
  }
}
