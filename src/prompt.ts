/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Questions the program asks in the terminal.
 *
 * Passwords use raw mode so the letters you type are not printed and, more
 * importantly, are not handed to the normal line editor. We still refuse to
 * run unless stdin is a terminal. A password piped from a file or typed into
 * `npm run wallet -- create password123` would land in a file or in shell
 * history. This program has no `--password` flag on purpose.
 */
import readline from 'node:readline';

const NEED_TERMINAL =
  'This command needs an interactive terminal so secrets are not stored in a shell history file. ' +
  'Open the Ubuntu window and run it there, instead of piping input from a file.';

export function promptVisible(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error(NEED_TERMINAL));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error(NEED_TERMINAL));
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = '';
    let settled = false;

    const restore = () => {
      stdin.off('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      restore();
      callback();
    };

    const onData = (key: string) => {
      // A paste arrives as one chunk: the letters plus the Enter at the end.
      // Handle each character. Treating the whole chunk as a control sequence
      // would throw away a pasted password.
      for (const character of key) {
        // Ctrl+C. Reject rather than leaving the terminal in raw mode.
        if (character === '\u0003') {
          stdout.write('\n');
          finish(() => reject(new Error('Stopped. Nothing was saved and nothing was sent.')));
          return;
        }

        if (character === '\r' || character === '\n') {
          stdout.write('\n');
          finish(() => resolve(value));
          return;
        }

        // Backspace. Erase one star so the count of stars matches the password.
        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }

        // Arrow keys and other control bytes are not part of the password.
        if (character < ' ') continue;

        value += character;
        stdout.write('*');
      }
    };

    // Listen before resume(). If we resumed first, a fast paste could arrive
    // in flowing mode with nobody listening, and those characters would be lost.
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.resume();
    stdout.write(question);
  });
}

/**
 * The two typed copies are compared only with each other, to catch a typo
 * before we encrypt. We do not store a password hash next to the file.
 * AES-GCM's authentication tag is what later proves the password was right.
 * A stored hash would be a second thing for a thief to attack.
 */
export async function chooseFilePassword(mnemonic: string): Promise<string> {
  console.log('Choose a password for the keystore file on this computer.');
  console.log('It is a different secret from the 12 words. At least 8 characters.');
  console.log('If you forget it, you can import the 12 words again. If you forget the words, the ETH is unrecoverable.');

  const first = await promptHidden('File password: ');
  if (first.length < 8) {
    throw new Error('Use at least 8 characters for the file password. Nothing was saved.');
  }
  if (first.normalize('NFC') === mnemonic.normalize('NFC')) {
    throw new Error('The file password must be different from the 12 words. Nothing was saved.');
  }

  const second = await promptHidden('Type the same file password again: ');
  if (first !== second) {
    throw new Error('The two passwords did not match. Nothing was saved.');
  }
  return first;
}

export async function confirmReplace(filePath: string, force: boolean): Promise<void> {
  const { existsSync } = await import('node:fs');
  if (!existsSync(filePath)) return;

  if (!force) {
    throw new Error(
      `A keystore already exists at ${filePath}.\n` +
        'This wallet will not overwrite it.\n' +
        'If the 12 words are written down and you really want a new file, run the same command with --force.\n' +
        'Nothing was changed.',
    );
  }

  console.log(`A keystore already exists at ${filePath}.`);
  console.log('Replacing the file means this computer will forget how to open the previous wallet.');
  console.log('A paper copy of the old words would still work with `import`.');
  const answer = await promptVisible('Type REPLACE to overwrite the file: ');
  if (answer.trim() !== 'REPLACE') {
    throw new Error('The file was left unchanged.');
  }
}

export async function confirmYes(yesFlag: boolean): Promise<void> {
  if (yesFlag) {
    console.log('Continuing because you passed --yes.');
    return;
  }
  const answer = await promptVisible('Type YES to broadcast this transaction: ');
  if (answer.trim().toUpperCase() !== 'YES') {
    throw new Error('Not confirmed. Nothing was sent.');
  }
}
