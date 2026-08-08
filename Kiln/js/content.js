/* Kiln — every table the app reads from.
 *
 * Content choices here are load-bearing, so they are argued rather than
 * listed. Three rules govern this file:
 *
 *   Prompts are about the world, never about the self. Not one prompt asks
 *   for a face, a body, a bedroom, a possession, or a ranking. Every prompt
 *   that asks "what do you think" is answerable by someone with nothing.
 *   A prompt that rewards having things is a prompt that punishes not having
 *   them, and eleven-year-olds notice long before they can say so.
 *
 *   Praise is specific and about the work. "Nice!" is noise; "the ending
 *   surprised me" is information a person can build on. The whole vocabulary
 *   points at the thing made, never at the maker's worth.
 *
 *   Peers are ordinary. They skip days, they make rough things, they are
 *   sometimes better than you and sometimes not. Nobody in this circle is a
 *   professional pretending to be a peer, which is the single most corrosive
 *   thing about the feeds this app is a response to.
 */
(function (K) {
  'use strict';

  /* --- the daily prompt ---------------------------------------------------
   * Everyone in your circle gets the same one. Shared constraint turns a feed
   * from a competition into a comparison of minds — the interesting kind. It
   * also removes the "what do I post" pressure that pushes kids toward the
   * only subject always available to them, which is themselves. */
  const PROMPTS = [
    { t: 'A door that has been locked for a hundred years. What is behind it?', c: ['draw', 'write', 'beat'] },
    { t: 'The sound a city makes at 4am.', c: ['beat', 'write', 'draw'] },
    { t: 'Invent a weather that does not exist.', c: ['draw', 'write'] },
    { t: 'Something small that deserves a monument.', c: ['draw', 'write'] },
    { t: 'A map of somewhere you have never been.', c: ['draw', 'write'] },
    { t: 'The last thing in the universe. What is it doing?', c: ['write', 'draw'] },
    { t: 'Make something that gets faster.', c: ['beat', 'draw'] },
    { t: 'A creature built entirely wrong that is doing fine anyway.', c: ['draw', 'write'] },
    { t: 'Two colours that should not go together. Make them go together.', c: ['draw'] },
    { t: 'Write instructions for something impossible.', c: ['write'] },
    { t: 'The inside of a sound.', c: ['draw', 'beat'] },
    { t: 'A machine with one job. It does that job perfectly.', c: ['draw', 'write'] },
    { t: 'What does 3am feel like if you had to draw the feeling, not the room?', c: ['draw', 'beat'] },
    { t: 'A story in six words.', c: ['write'] },
    { t: 'Make a rhythm you could walk to.', c: ['beat'] },
    { t: 'Somewhere that is only real when nobody is looking.', c: ['draw', 'write'] },
    { t: 'The worst possible superpower. Make it sound great.', c: ['write', 'draw'] },
    { t: 'A colour that has no name yet. Name it.', c: ['draw', 'write'] },
    { t: 'Draw a place using only straight lines.', c: ['draw'] },
    { t: 'Something you know how to do that you could teach in four sentences.', c: ['write'] },
    { t: 'A beat that sounds like getting away with something.', c: ['beat'] },
    { t: 'What is under the floor?', c: ['draw', 'write'] },
    { t: 'Make the same shape five times, worse each time, on purpose.', c: ['draw'] },
    { t: 'A conversation between two things that cannot talk.', c: ['write'] },
    { t: 'The quietest thing you can make that is still interesting.', c: ['beat', 'draw'] },
    { t: 'An object from a hundred years from now, found in a field.', c: ['draw', 'write'] },
    { t: 'Describe a smell without naming what it is.', c: ['write'] },
    { t: 'A pattern that almost repeats.', c: ['draw', 'beat'] },
    { t: 'Something you changed your mind about.', c: ['write', 'draw'] },
    { t: 'A tiny room with one enormous thing in it.', c: ['draw'] },
    { t: 'The theme music for a very boring job.', c: ['beat'] },
    { t: 'Draw something you can only half remember.', c: ['draw'] },
    { t: 'A rule that everybody follows and nobody agreed to.', c: ['write', 'draw'] },
    { t: 'Make a thing out of exactly three parts.', c: ['draw', 'beat'] },
    { t: 'What does a plant think winter is?', c: ['write', 'draw'] },
    { t: 'The bit of a song that gets stuck. Make one.', c: ['beat'] },
    { t: 'Somewhere with bad weather and good light.', c: ['draw'] },
    { t: 'An apology from something that is not sorry.', c: ['write'] },
    { t: 'Build a beat that falls apart at the end.', c: ['beat'] },
    { t: 'The view from something very small.', c: ['draw', 'write'] },
    { t: 'A word for a feeling English does not have a word for.', c: ['write'] },
    { t: 'Draw the shape of a week.', c: ['draw'] },
    { t: 'Make something that sounds older than it is.', c: ['beat'] },
    { t: 'A place that is 90% sky.', c: ['draw', 'write'] },
    { t: 'Something that got left behind. Not sad about it.', c: ['write', 'draw'] },
    { t: 'The most useful lie.', c: ['write'] },
    { t: 'Two beats fighting. One wins.', c: ['beat'] },
    { t: 'Draw the same object from a viewpoint nobody picks.', c: ['draw'] }
  ];

  /* --- crafts -------------------------------------------------------------
   * Three real tools, not three content formats. The difference matters: a
   * format is a shape you pour yourself into, a tool is a thing you get
   * better at. Getting better at something is the only durable reason to
   * open an app every day. */
  const CRAFTS = {
    draw: {
      id: 'draw', name: 'Draw', mark: '✏️',
      blurb: 'A limited palette and a canvas. The limits are the point.'
    },
    write: {
      id: 'write', name: 'Write', mark: '✒️',
      blurb: 'Words, no character limit and no formatting. Just the sentence.'
    },
    beat: {
      id: 'beat', name: 'Beat', mark: '🥁',
      blurb: 'Four sounds, sixteen steps, made in the browser out of nothing.'
    }
  };

  /* Levels are named for what your hands can do, never for a rank. There is
   * no number, no badge, and no way for another person to see any of it — a
   * skill ladder that other people can read is a leaderboard. */
  const LEVELS = [
    { at: 0, name: 'first marks' },
    { at: 2, name: 'finding it' },
    { at: 5, name: 'has a hand' },
    { at: 10, name: 'knows the tool' },
    { at: 18, name: 'has choices' },
    { at: 30, name: 'has a style' },
    { at: 50, name: 'breaks the rules on purpose' },
    { at: 80, name: 'makes it look easy' }
  ];

  /* Deliberate practice, so the ladder measures attention and not volume.
   * Each one is a constraint you opt into, verifiable from the piece itself. */
  const PRACTICE = {
    draw: [
      { id: 'd-three', name: 'Three colours only', note: 'Use no more than three colours in one drawing.' },
      { id: 'd-nolift', name: 'One line', note: 'Draw a whole piece in a single unbroken stroke.' },
      { id: 'd-big', name: 'Fill the frame', note: 'Make something that touches all four edges.' },
      { id: 'd-empty', name: 'Leave room', note: 'Finish a drawing that is mostly empty space.' }
    ],
    write: [
      { id: 'w-short', name: 'Under forty words', note: 'Say the whole thing in fewer than forty words.' },
      { id: 'w-long', name: 'Past two hundred', note: 'Keep going past two hundred words without padding.' },
      { id: 'w-noadj', name: 'No adjectives', note: 'Write a piece without a single describing word.' },
      { id: 'w-dial', name: 'Only speech', note: 'Tell it entirely in things people say.' }
    ],
    beat: [
      { id: 'b-sparse', name: 'Under twelve hits', note: 'Make a pattern from twelve hits or fewer.' },
      { id: 'b-full', name: 'All four voices', note: 'Use every one of the four sounds.' },
      { id: 'b-odd', name: 'Off the grid', note: 'Put something on a step nobody puts things on.' },
      { id: 'b-quiet', name: 'Leave a gap', note: 'Leave four steps in a row completely silent.' }
    ]
  };

  /* --- responses ----------------------------------------------------------
   * The entire response system. There is no like, no heart, no upvote, no
   * count anywhere in this app — not shown to the reader, not shown to the
   * maker, not stored. A tap that costs nothing and says nothing is a
   * slot-machine lever with a smile painted on it.
   *
   * What a maker gets instead is a sentence about the work, from someone
   * they know, and they are the only person who ever sees it. */
  const PRAISE = [
    { id: 'colour', t: 'the colours', for: ['draw'] },
    { id: 'shape', t: 'the shape of it', for: ['draw'] },
    { id: 'hang', t: "I'd put this on a wall", for: ['draw'] },
    { id: 'detail', t: 'the small detail in the corner', for: ['draw'] },
    { id: 'ending', t: 'the ending', for: ['write'] },
    { id: 'line', t: 'one line stuck with me', for: ['write'] },
    { id: 'true', t: 'this felt true', for: ['write'] },
    { id: 'again', t: 'I read it twice', for: ['write'] },
    { id: 'groove', t: 'the groove', for: ['beat'] },
    { id: 'gap', t: 'what you left out', for: ['beat'] },
    { id: 'head', t: "it's in my head now", for: ['beat'] },
    { id: 'turn', t: 'the turn at the end', for: ['beat'] },
    { id: 'laugh', t: 'made me laugh', for: ['draw', 'write', 'beat'] },
    { id: 'think', t: 'made me think', for: ['draw', 'write', 'beat'] },
    { id: 'brave', t: 'this was brave', for: ['draw', 'write', 'beat'] },
    { id: 'new', t: 'you tried something new', for: ['draw', 'write', 'beat'] },
    { id: 'odd', t: 'nobody else did this', for: ['draw', 'write', 'beat'] },
    { id: 'work', t: 'I can see the work in it', for: ['draw', 'write', 'beat'] }
  ];

  /* --- the circle ---------------------------------------------------------
   * Eight people. Not eight hundred, and not a public. The cap is the
   * feature: a circle you can hold in your head is a circle you behave well
   * in, and no amount of moderation buys back what scale takes away.
   *
   * `cadence` is how often they make something. Nobody is at 1.0. A feed
   * where everyone posts every day teaches you that not posting is failure. */
  const PEERS = [
    {
      id: 'nour', name: 'Nour', mark: '🜁', hue: 190,
      about: 'Draws buildings that could not stand up.',
      crafts: ['draw', 'draw', 'write'], cadence: 0.72, wordy: 0.4
    },
    {
      id: 'tomas', name: 'Tomás', mark: '🜂', hue: 22,
      about: 'Makes beats on a broken laptop. Refuses to fix it.',
      crafts: ['beat', 'beat', 'draw'], cadence: 0.55, wordy: 0.2
    },
    {
      id: 'imani', name: 'Imani', mark: '🜃', hue: 285,
      about: 'Writes short. Very short.',
      crafts: ['write', 'write', 'draw'], cadence: 0.8, wordy: 0.15
    },
    {
      id: 'yuki', name: 'Yuki', mark: '🜄', hue: 145,
      about: 'Learning all three at once, badly, cheerfully.',
      crafts: ['draw', 'write', 'beat'], cadence: 0.62, wordy: 0.6
    },
    {
      id: 'basil', name: 'Basil', mark: '✧', hue: 48,
      about: 'Away a lot. Worth the wait.',
      crafts: ['write', 'draw'], cadence: 0.22, wordy: 0.85
    },
    {
      id: 'priya', name: 'Priya', mark: '◇', hue: 330,
      about: 'One colour at a time, for months.',
      crafts: ['draw'], cadence: 0.66, wordy: 0.3
    },
    {
      id: 'okwe', name: 'Okwe', mark: '◐', hue: 210,
      about: 'Sound first, everything else later.',
      crafts: ['beat', 'beat', 'write'], cadence: 0.48, wordy: 0.35
    },
    {
      id: 'lena', name: 'Lena', mark: '☾', hue: 8,
      about: 'Comes back after weeks with something enormous.',
      crafts: ['draw', 'write'], cadence: 0.18, wordy: 0.7
    }
  ];

  /* --- writing generator --------------------------------------------------
   * Peers write real sentences assembled from parts. Not great writing, and
   * that is deliberate: the work in your feed should be reachable. */
  const W = {
    open: [
      'Nobody mentions', 'There is a version of this where', 'My grandmother says',
      'The trick is that', 'It started when', 'Every so often',
      'Here is the part nobody tells you:', 'For about a week',
      'I keep thinking about how', 'Somewhere under all of it'
    ],
    subj: [
      'the light', 'the whole street', 'a door nobody uses', 'the wet part of the year',
      'my brother', 'the machine in the hall', 'the last bus', 'a bird that lives in the sign',
      'the grey between two blues', 'the second floor', 'the noise the pipes make',
      'the field behind the shops'
    ],
    verb: [
      'goes quiet', 'gets it wrong on purpose', 'holds still', 'keeps going anyway',
      'forgets what it was for', 'answers back', 'takes its time', 'refuses',
      'starts again from nothing', 'means something else now'
    ],
    tail: [
      'and that is the good part.', 'which is not a complaint.', 'nobody has fixed it.',
      'I would not change it.', 'that is the whole thing.', 'it works.',
      'so we left it.', 'and then it was fine.', 'that is enough.',
      'I am still deciding.'
    ],
    mid: [
      'The rest is guesswork.', 'It does not need a reason.',
      'Two things can be true.', 'It is smaller than it sounds.',
      'You have to stand in the right place.', 'Nothing is hiding.',
      'It only happens once.', 'It has always been like this.'
    ]
  };

  const TITLES = [
    'untitled', 'first go', 'the good one', 'attempt four', 'rough',
    'from memory', 'for later', 'small', 'loud version', 'quiet version',
    'nearly', 'ok actually', 'no idea', 'yes', 'the one with the hole in it'
  ];

  /* --- the Watchtower -----------------------------------------------------
   * The literacy layer. Each entry names a technique, explains the specific
   * thing it does to a body or a mind, ships a live demo that does it to you
   * on purpose, and then says what Kiln does in its place.
   *
   * The demos are real. The variable-reward one uses an actual variable-ratio
   * schedule and shows the receipts. Being told about a hook and feeling one
   * close are different kinds of knowing, and only the second one sticks. */
  const PATTERNS = [
    {
      id: 'variable',
      name: 'The unpredictable reward',
      one: 'Never quite knowing what a tap will give you.',
      body: 'A reward you can predict stops being exciting. A reward that arrives on a schedule you cannot work out never does. This is the same schedule that keeps a gambler at a machine, and it is why the refresh gesture exists at all: not because the feed needs manual updating — it does not — but because the pull is the lever.',
      body2: 'Your brain releases dopamine hardest in the gap before you know, not after. Designers who use this are not targeting your happiness. They are targeting the gap.',
      demo: 'variable',
      instead: 'Kiln has no refresh. The day\'s batch is assembled once and it is the same batch whether you open the app once or thirty times. There is nothing to pull for.'
    },
    {
      id: 'infinite',
      name: 'The feed with no bottom',
      one: 'Removing every natural place to stop.',
      body: 'People stop doing things at boundaries — the end of a chapter, the bottom of a page, the last photo. Infinite scroll deletes the boundary. Nothing about the content changed; the only change was removing your cue to leave, and the average session doubled.',
      body2: 'You do not choose to keep scrolling so much as you fail to be given a moment in which choosing was possible.',
      demo: 'infinite',
      instead: 'Your batch ends. It ends with a card that says so, and there is nothing underneath it. Reaching the end of Kiln is a normal thing that happens every day.'
    },
    {
      id: 'streak',
      name: 'The streak',
      one: 'Building something whose only feature is that you can lose it.',
      body: 'A streak is not a record of your effort. It is a hostage. Loss aversion means losing a 60-day streak hurts roughly twice as much as gaining it felt good, so the longer you keep one the more the app owns you. The number does nothing. It cannot be spent. It exists to be threatened.',
      body2: 'Watch for the moment a streak stops being about the thing you were learning and starts being about the streak.',
      demo: 'streak',
      instead: 'Kiln counts nothing consecutive. Your shelf only grows. Come back after two months and the app will tell you exactly that: nothing was lost, because there was never anything set up to be lost.'
    },
    {
      id: 'metrics',
      name: 'Public numbers on people',
      one: 'Turning a person into a score other people can read.',
      body: 'The moment a count is visible to anyone but you, everything upstream of it bends. You start making the thing that gets the number instead of the thing you meant. And because the count is public, everyone can rank everyone, continuously, without ever deciding to.',
      body2: 'Adolescent brains are especially sensitive to peer feedback — the same regions light up for social approval as for physical reward. A visible like count is that system with a dial on it, handed to strangers.',
      demo: 'metrics',
      instead: 'There are no counts in Kiln. Not likes, not followers, not views, not a count of responses. Your responses are words, and only the maker ever sees them.'
    },
    {
      id: 'notify',
      name: 'The vague notification',
      one: 'Telling you almost nothing so you have to come and look.',
      body: '"Someone commented on a post you interacted with." That sentence is engineered to be unresolvable from the lock screen. A complete notification would let you decide whether to care. An incomplete one makes you open the app to find out, which was always the actual goal.',
      body2: 'The buzz also arrives at whatever hour the model thinks you are most likely to be reachable, which is not the same as the hour you would have chosen.',
      demo: 'notify',
      instead: 'Kiln never interrupts. Anything that happened is waiting in one place, described fully, the next time you decide to open it.'
    },
    {
      id: 'autoplay',
      name: 'Autoplay and the countdown',
      one: 'Making the next thing start before you decide.',
      body: 'A five-second countdown to the next video reframes the choice. Instead of "do I want to watch another", the question becomes "do I want to interrupt one that is already starting" — and the second question is much harder to answer no to, because stopping something in motion feels like an action and letting it run feels like nothing.',
      body2: 'The default is doing the deciding. That is what a default is for.',
      demo: 'autoplay',
      instead: 'Nothing in Kiln plays on its own. A beat plays when you press it and stops at the end of the bar unless you loop it yourself.'
    },
    {
      id: 'compare',
      name: 'The filter and the drift',
      one: 'Moving what a normal face looks like, a little at a time.',
      body: 'A beauty filter does not just edit one photo. Applied to everything you see, it moves the average — and your sense of a normal face follows the average. The drift is invisible from inside because every single image looked only slightly adjusted.',
      body2: 'The measurable harm is not vanity. It is that the baseline moved while you were looking at it, and now an unedited face reads as a flawed one.',
      demo: 'compare',
      instead: 'Kiln has no camera, no face, and no filter. Nothing in this app asks you to be the content.'
    },
    {
      id: 'ranking',
      name: 'Ranking for reaction',
      one: 'Ordering what you see by what provokes you most.',
      body: 'A feed sorted by predicted engagement is not sorted by what is good, or true, or from people you care about. Anger and outrage predict engagement extremely well, so a system optimising for engagement discovers on its own — without anyone intending it — that it should show you things that make you angry.',
      body2: 'Nobody wrote a rule saying "promote outrage". The rule said "promote what gets responses", and outrage won on the merits.',
      demo: 'ranking',
      instead: 'Kiln\'s ordering rules are printed in the Audit tab in plain English, every rule has a switch, and every post can tell you which rule put it where it is.'
    },
    {
      id: 'exit',
      name: 'The guilt-trip exit',
      one: 'Making leaving feel like a betrayal.',
      body: '"Are you sure? Your friends will miss you." "You will lose your progress." "Just five more minutes?" A confirmation dialogue that argues with you is not asking a question. It is a toll on the way out, and it works because the emotional cost of leaving got raised at exactly the moment you tried to.',
      body2: 'Notice how leaving is always more clicks than staying. That asymmetry is the whole trick.',
      demo: 'exit',
      instead: 'Leaving Kiln is one tap and the app says goodbye. The end-of-session card exists to help you stop, not to slow you down.'
    },
    {
      id: 'harvest',
      name: 'Quiet collection',
      one: 'Taking more than the thing you are using needs.',
      body: 'Most of what an app knows about you was not required to make the app work. Contacts, location, the other apps on the device, how long you paused over a post you did not tap. That last one is especially valuable and especially invisible: your hesitation is a data point, and you never agreed to send it because you never knew you had made it.',
      body2: 'A useful question for any app: what does this need to know to do its actual job, and what is it taking beyond that?',
      demo: 'harvest',
      instead: 'Kiln makes zero network requests. There is no server to send anything to. Everything is in your browser\'s local storage, you can read the whole file in the Audit tab, and one button erases it.'
    }
  ];

  /* Words that suggest a reply is being written hot. Not a filter and not a
   * ban — the reply always sends if you want it to. It buys ninety seconds
   * between the feeling and the sending, which is where most of the regret
   * in a young person's online life actually lives. */
  const HEAT = [
    'stupid', 'dumb', 'ugly', 'trash', 'garbage', 'hate', 'shut up', 'idiot',
    'worst', 'cringe', 'kill', 'die', 'loser', 'nobody likes', 'ratio', 'mid',
    'awful', 'terrible', 'pathetic', 'annoying', 'weird', 'freak'
  ];

  K.content = { PROMPTS, CRAFTS, LEVELS, PRACTICE, PRAISE, PEERS, W, TITLES, PATTERNS, HEAT };
})(window.Kiln = window.Kiln || {});
