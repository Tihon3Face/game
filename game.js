const crypto = require('crypto');
const readline = require('readline');

class Dice {
    constructor(values) {
        this.values = values;
        this.faces = values.length;
    }
    roll(index) {
        return this.values[index];
    }
    toString() {
        return `[${this.values.join(',')}]`;
    }
}

class DiceParser {
    static parse(argv) {
        if (argv.length < 5) {
            throw new Error("At least 3 dice must be provided. Example: node game.js 1,2,3,4,5,6 1,2,3,4,5,6 1,2,3,4,5,6");
        }

        const diceList = [];
        let faceCount = null;

        for (let i = 2; i < argv.length; i++) {
            const values = argv[i].split(',').map(val => {
                const num = parseInt(val.trim(), 10);
                if (isNaN(num)) throw new Error(`Invalid dice value: ${val}. All values must be integers.`);
                return num;
            });

            if (!faceCount) faceCount = values.length;
            else if (values.length !== faceCount) {
                throw new Error(`All dice must have the same number of faces. Expected ${faceCount} but got ${values.length}.`);
            }

            diceList.push(new Dice(values));
        }

        return diceList;
    }
}

class ProbabilityCalculator {
    static calculate(diceList) {
        const matrix = [];
        for (let i = 0; i < diceList.length; i++) {
            matrix[i] = [];
            for (let j = 0; j < diceList.length; j++) {
                if (i === j) {
                    matrix[i][j] = '-';
                    continue;
                }
                
                let wins = 0;
                const total = diceList[i].faces * diceList[j].faces;
                
                for (let k = 0; k < diceList[i].faces; k++) {
                    for (let l = 0; l < diceList[j].faces; l++) {
                        if (diceList[i].values[k] > diceList[j].values[l]) wins++;
                    }
                }
                
                matrix[i][j] = (wins / total * 100).toFixed(1) + '%';
            }
        }
        return matrix;
    }
}

class ProbabilityTable {
    static generate(diceList, probabilities) {
        const headers = ['Dice \\ vs >', ...diceList.map((_, i) => `D${i}`)];
        const rows = [headers];
        
        for (let i = 0; i < diceList.length; i++) {
            rows.push([`D${i} (${diceList[i]})`, ...probabilities[i]]);
        }

        const colWidths = headers.map((_, i) => 
            Math.max(...rows.map(row => String(row[i]).length))
        );

        let table = '';
        const border = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+\n';
        
        table += border;
        table += '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |\n';
        table += border;
        
        for (let i = 1; i < rows.length; i++) {
            table += '| ' + rows[i].map((cell, j) => String(cell).padEnd(colWidths[j])).join(' | ') + ' |\n';
        }
        
        table += border;
        return table;
    }
}

class FairRandom {
    static generateKey() {
        return crypto.randomBytes(32);
    }

    static generateInRange(min, max) {
        const range = max - min + 1;
        const maxBytes = Math.ceil(Math.log2(range) / 8);
        const maxVal = 256 ** maxBytes;
        const maxAcceptable = maxVal - (maxVal % range);

        let randomNum;
        do {
            randomNum = crypto.randomBytes(maxBytes).readUIntBE(0, maxBytes);
        } while (randomNum >= maxAcceptable);

        return min + (randomNum % range);
    }

    static calculateHMAC(key, message) {
        return crypto.createHmac('sha3-256', key)
                   .update(message.toString())
                   .digest('hex')
                   .toUpperCase();
    }
}

class Game {
    constructor(diceList) {
        this.dice = diceList;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.playerDice = null;
        this.computerDice = null;
        this.currentPlayer = null;
    }

    async start() {
        try {
            await this.determineFirstMove();
            await this.selectDicePhase();
            await this.playRound();
        } catch (err) {
            if (err.message !== "Game exited by user") {
                console.error("Error:", err.message);
            }
        } finally {
            this.rl.close();
        }
    }

    async determineFirstMove() {
        const key = FairRandom.generateKey();
        const computerChoice = FairRandom.generateInRange(0, 1);
        const hmac = FairRandom.calculateHMAC(key, computerChoice);

        console.log(`I selected a random value in range 0..1 (HMAC=${hmac})`);
        console.log("Try to guess my selection:");
        console.log("0 - 0\n1 - 1\nX - exit\n? - help");

        const answer = await this.prompt("Your selection: ");
        if (answer.toUpperCase() === 'X') throw new Error("Game exited by user");
        if (answer === '?') {
            this.showHelp();
            return this.determineFirstMove();
        }

        const userChoice = parseInt(answer);
        if (isNaN(userChoice) || userChoice < 0 || userChoice > 1) {
            console.log("Invalid input. Please enter 0, 1, X or ?");
            return this.determineFirstMove();
        }

        const result = (computerChoice + userChoice) % 2;
        console.log(`My selection: ${computerChoice} (KEY=${key.toString('hex').toUpperCase()})`);
        this.currentPlayer = result === 0 ? 'computer' : 'player';
        console.log(`${this.currentPlayer === 'computer' ? 'I' : 'You'} make the first move.`);
    }

    async selectDicePhase() {
        if (this.currentPlayer === 'computer') {
            await this.computerSelectDice();
        }
        await this.playerSelectDice();
        if (this.currentPlayer === 'player') {
            await this.computerSelectDice();
        }
    }

    async computerSelectDice() {
        const availableDice = this.dice.filter(d => d !== this.playerDice);
        const choice = FairRandom.generateInRange(0, availableDice.length - 1);
        this.computerDice = availableDice[choice];
        console.log(`I choose the ${this.computerDice} dice.`);
    }

    async playerSelectDice() {
        console.log("Choose your dice:");
        this.dice.forEach((d, i) => {
            if (d !== this.computerDice) {
                console.log(`${i} - ${d}`);
            }
        });
        console.log("X - exit\n? - help");

        const answer = await this.prompt("Your selection: ");
        if (answer.toUpperCase() === 'X') throw new Error("Game exited by user");
        if (answer === '?') {
            this.showHelp();
            return this.playerSelectDice();
        }

        const choice = parseInt(answer);
        if (isNaN(choice) || choice < 0 || choice >= this.dice.length || this.dice[choice] === this.computerDice) {
            console.log(`Invalid input. Please enter a number between 0 and ${this.dice.length - 1}, X or ?`);
            return this.playerSelectDice();
        }

        this.playerDice = this.dice[choice];
        console.log(`You choose the ${this.playerDice} dice.`);
    }

    async playRound() {
        if (this.currentPlayer === 'computer') {
            await this.computerRoll();
            await this.playerRoll();
        } else {
            await this.playerRoll();
            await this.computerRoll();
        }
        this.determineWinner();
    }

    async computerRoll() {
        console.log("It's time for my roll.");
        const key = FairRandom.generateKey();
        const computerChoice = FairRandom.generateInRange(0, this.computerDice.faces - 1);
        const hmac = FairRandom.calculateHMAC(key, computerChoice);

        console.log(`I selected a random value in range 0..${this.computerDice.faces - 1} (HMAC=${hmac})`);
        console.log(`Add your number modulo ${this.computerDice.faces}.`);
        for (let i = 0; i < this.computerDice.faces; i++) {
            console.log(`${i} - ${i}`);
        }
        console.log("X - exit\n? - help");

        const answer = await this.prompt("Your selection: ");
        if (answer.toUpperCase() === 'X') throw new Error("Game exited by user");
        if (answer === '?') {
            this.showHelp();
            return this.computerRoll();
        }

        const userChoice = parseInt(answer);
        if (isNaN(userChoice) || userChoice < 0 || userChoice >= this.computerDice.faces) {
            console.log(`Invalid input. Please enter a number between 0 and ${this.computerDice.faces - 1}, X or ?`);
            return this.computerRoll();
        }

        const result = (computerChoice + userChoice) % this.computerDice.faces;
        console.log(`My number is ${computerChoice} (KEY=${key.toString('hex').toUpperCase()})`);
        console.log(`The fair number generation result is ${computerChoice} + ${userChoice} = ${result} (mod ${this.computerDice.faces}).`);
        
        const rollResult = this.computerDice.roll(result);
        console.log(`My roll result is ${rollResult}.`);
        this.computerRollResult = rollResult;
    }

    async playerRoll() {
        console.log("It's time for your roll.");
        const key = FairRandom.generateKey();
        const computerChoice = FairRandom.generateInRange(0, this.playerDice.faces - 1);
        const hmac = FairRandom.calculateHMAC(key, computerChoice);

        console.log(`I selected a random value in range 0..${this.playerDice.faces - 1} (HMAC=${hmac})`);
        console.log(`Add your number modulo ${this.playerDice.faces}.`);
        for (let i = 0; i < this.playerDice.faces; i++) {
            console.log(`${i} - ${i}`);
        }
        console.log("X - exit\n? - help");

        const answer = await this.prompt("Your selection: ");
        if (answer.toUpperCase() === 'X') throw new Error("Game exited by user");
        if (answer === '?') {
            this.showHelp();
            return this.playerRoll();
        }

        const userChoice = parseInt(answer);
        if (isNaN(userChoice) || userChoice < 0 || userChoice >= this.playerDice.faces) {
            console.log(`Invalid input. Please enter a number between 0 and ${this.playerDice.faces - 1}, X or ?`);
            return this.playerRoll();
        }

        const result = (computerChoice + userChoice) % this.playerDice.faces;
        console.log(`My number is ${computerChoice} (KEY=${key.toString('hex').toUpperCase()})`);
        console.log(`The fair number generation result is ${computerChoice} + ${userChoice} = ${result} (mod ${this.playerDice.faces}).`);
        
        const rollResult = this.playerDice.roll(result);
        console.log(`Your roll result is ${rollResult}.`);
        this.playerRollResult = rollResult;
    }

    determineWinner() {
        if (this.playerRollResult > this.computerRollResult) {
            console.log(`You win (${this.playerRollResult} > ${this.computerRollResult})!`);
        } else if (this.playerRollResult < this.computerRollResult) {
            console.log(`I win (${this.computerRollResult} > ${this.playerRollResult})!`);
        } else {
            console.log(`It's a tie (${this.playerRollResult} = ${this.computerRollResult})!`);
        }
    }

    showHelp() {
        const probabilities = ProbabilityCalculator.calculate(this.dice);
        const table = ProbabilityTable.generate(this.dice, probabilities);
        console.log("\nProbabilities table (row dice beats column dice):");
        console.log(table);
        console.log("X - exit the game");
        console.log("? - show this help\n");
    }

    prompt(question) {
        return new Promise(resolve => this.rl.question(question, resolve));
    }
}

try {
    const diceList = DiceParser.parse(process.argv);
    const game = new Game(diceList);
    game.start();
} catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
}