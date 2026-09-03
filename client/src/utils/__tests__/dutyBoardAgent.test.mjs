import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./_resolveExtensions.mjs', import.meta.url);

const {
  CLOSEOUT_PLACEHOLDER,
  GATED_WRITE_REFUSAL,
  formatApparatus,
  formatCommandBoard,
  formatDuty,
  formatDutyBoardReplies,
  formatIncidents,
  formatRoster,
  planDutyBoard,
  runDutyBoardTurn,
} = await import('../dutyBoardAgent.js');
const { DUTY_BOARD_READ_VERBS, GATED_WRITE_VERBS } = await import('../askVerbs.js');
const { actingAsLine, actingAsRole } = await import('../actingAs.js');

test('Duty/Board maps board and staffing questions to read verbs only', () => {
  const board = planDutyBoard("What's on the board?");
  assert.equal(board.kind, 'reads');
  assert.deepEqual(board.verbs, ['board_read']);

  const staff = planDutyBoard('Any staffing concerns?');
  assert.equal(staff.kind, 'reads');
  assert.ok(staff.verbs.includes('duty_read'));
  assert.ok(staff.verbs.includes('roster_read'));

  const sitrep = planDutyBoard('Give me a sitrep');
  assert.ok(sitrep.verbs.includes('board_read'));
  assert.ok(sitrep.verbs.includes('duty_read'));
  assert.ok(sitrep.verbs.includes('apparatus_status_read'));
});

test('Duty/Board never selects a gated write verb', () => {
  const samples = [
    'Submit this to NERIS',
    'Clear the unit',
    'Notify the chief',
    'Write the incident narrative',
    "What's on the board?",
    'Any staffing concerns?',
    'Which rigs are in service?',
  ];
  for (const msg of samples) {
    const plan = planDutyBoard(msg);
    for (const verb of plan.verbs) {
      assert.ok(DUTY_BOARD_READ_VERBS.includes(verb), `${msg} selected ${verb}`);
      assert.ok(!GATED_WRITE_VERBS.includes(verb), `${msg} leaked write ${verb}`);
    }
  }
  assert.equal(planDutyBoard('Submit NERIS for incident 12').kind, 'gated');
  assert.equal(planDutyBoard('Submit NERIS for incident 12').text, GATED_WRITE_REFUSAL);
  assert.equal(planDutyBoard('Clear unit 4').text, GATED_WRITE_REFUSAL);
});

test('formatters stay dense and do not invent legal narrative', () => {
  const live = formatCommandBoard({
    incident_type: 'Medical',
    address: 'Oak St',
    dispatched_at: '2026-05-20T08:12:00Z',
    units_count: 2,
  });
  assert.match(live, /ACTIVE/);
  assert.match(live, /Medical/);
  assert.match(live, /Oak St/);
  assert.doesNotMatch(live, /Heavy smoke|narrative/i);

  const emptyBoard = formatCommandBoard(null);
  assert.match(emptyBoard, /no active command board/i);

  const duty = formatDuty({
    payload: {
      crew: [
        { member_name: 'Capt. Rivera', position_name: 'Captain', designation: 'E-1' },
        { member_name: 'FF Smith', position_name: 'Firefighter', designation: 'E-1' },
      ],
    },
  });
  assert.match(duty, /2 riding/);
  assert.match(duty, /Capt\. Rivera/);

  const board = formatIncidents([
    { id: 1, incidentNumber: '25-0142', type: 'Medical', address: 'Oak St', date: '2026-05-20', time: '08:12' },
    { id: 2, incidentNumber: '25-0140', type: 'Still', address: '1 Main', disposition: 'closed' },
  ]);
  assert.match(board, /1 open/);
  assert.match(board, /25-0142/);
  assert.doesNotMatch(board, /Heavy smoke|narrative/i);

  const roster = formatRoster([
    { name: 'Rivera', status: 'Active' },
    { name: 'Smith', status: 'Active' },
    { name: 'Lee', status: 'Inactive' },
  ]);
  assert.match(roster, /3 on file/);
  assert.match(roster, /Daily Staffing/);

  const apps = formatApparatus([
    { designation: 'E-1', status: 'in_service' },
    { designation: 'R-2', status: 'on_scene' },
  ]);
  assert.match(apps, /1 in service of 2/);
  assert.match(apps, /R-2: on scene/);
});

test('runDutyBoardTurn calls invoke with the planned read verbs', async () => {
  const called = [];
  const invoke = async (verb, args) => {
    called.push({ verb, args });
    if (verb === 'board_read' || verb === 'duty_read') {
      return { result: { data: null } };
    }
    return { result: { data: [] } };
  };
  const turn = await runDutyBoardTurn("What's on the board?", { invoke });
  assert.deepEqual(called.map((c) => c.verb), ['board_read']);
  assert.match(turn.text, /no active command board/i);
});

test('acting-as chip reflects the session role family', () => {
  assert.equal(actingAsRole({ role: 'officer', name: 'Capt. Rivera' }), 'Officer');
  assert.equal(actingAsRole({ role: 'chief', name: 'Chief Dale' }), 'Chief');
  assert.equal(actingAsRole({ role: 'member', name: 'FF Smith' }), 'Member');
  assert.equal(actingAsRole({ role: 'trainee', name: 'Recruit' }), 'Trainee');
  assert.equal(actingAsLine({ role: 'officer', name: 'Capt. Rivera' }), 'Capt. Rivera · Officer');
});

test('closeout placeholder is not a write path', () => {
  assert.match(CLOSEOUT_PLACEHOLDER, /coming next/i);
  assert.doesNotMatch(CLOSEOUT_PLACEHOLDER, /\bMCP\b/);
});

test('formatDutyBoardReplies stays silent on plumbing names', () => {
  const text = formatDutyBoardReplies(
    { kind: 'reads', verbs: ['board_read'] },
    [{ verb: 'board_read', ok: true, out: { result: { data: null } } }],
  );
  assert.doesNotMatch(text, /\bMCP\b/);
  assert.doesNotMatch(text, /invoke/i);
});
