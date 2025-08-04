const crypto = require('crypto');
const readline = require('readline');

class Dice {
    constructor(values) {
        this.values = values;
    }

    getFaces() {
        return this.values.length;
    }

    roll(index) {
        return this.values[index];
    }

    toString() {
        return `[${this.values.join(',')}]`;
    }
}

class DiceParser {
    static parse(args) {
        if (args.length < 5) { // Исправлено! Теперь считает аргументы правильно
            throw new Error("At least 3 dice must be provided. Example: node game.js 1,2,3,4,5,6 1,2,3,4,5,6 1,2,3,4,5,6");
        }
        const diceList = [];
        for (let i = 2; i < args.length; i++) {
            const values = args[i].split(',').map(val => {
                const num = parseInt(val.trim(), 10);
                if (isNaN(num)) throw new Error(`Invalid dice value: ${val}. All values must be integers.`);
                return num;
            });
            diceList.push(new Dice(values));
        }
        return diceList;
    }
}

class ProbabilityCalculator {
    static calculateProbabilities(diceList) {
        const probabilities = [];
        
        for (let i = 0; i < diceList.length; i++) {
            probabilities[i] = [];
            for (let j = 0; j < diceList.length; j++) {
                if (i === j) {
                    probabilities[i][j] = '-';
                    continue;
                }
                
                const diceA = diceList[i];
                const diceB = diceList[j];
                let wins = 0;
                let total = 0;
                
                for (const a of diceA.values) {
                    for (const b of diceB.values) {
                        if (a > b) wins++;
                        total++;
                    }
                }
                
                probabilities[i][j] = (wins / total * 100).toFixed(1) + '%';
            }
        }
        
        return probabilities;
    }
}

class ProbabilityTable {
    static generateTable(diceList, probabilities) {
        const headers = ['Dice \\ vs >'];
        for (let i = 0; i < diceList.length; i++) {
            headers.push(`D${i}`);
        }
        
        const rows = [headers];
        
        for (let i = 0; i < diceList.length; i++) {
            const row = [`D${i} (${diceList[i].toString()})`];
            for (let j = 0; j < diceList.length; j++) {
                row.push(probabilities[i][j]);
            }
            rows.push(row);
        }
        
        const colWidths = rows[0].map((_, i) => 
            Math.max(...rows.map(row => row[i].length))
        );
        
        let table = '';
        
        table += '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+\n';
        
        table += '| ' + rows[0].map((cell, i) => 
            cell.padEnd(colWidths[i])
        ).join(' | ') + ' |\n';
        
        table += '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+\n';
        
        for (let i = 1; i < rows.length; i++) {
            table += '| ' + rows[i].map((cell, j) => 
                cell.padEnd(colWidths[j])
            ).join(' | ') + ' |\n';
        }
        
        table += '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+\n';
        
        return table;
    }
}

class FairRandomGenerator {
    constructor() {
        this.key = null;
        this.computerValue = null;
        this.hmac = null;
    }

    prepareRandomSelection(max) {
        this.key = crypto.randomBytes(32);
        this.computerValue = this.generateSecureRandomInt(0, max);
        const hmac = crypto.createHmac('sha3-256', this.key);
        hmac.update(this.computerValue.toString());
        this.hmac = hmac.digest('hex').toUpperCase();
        return this.hmac;
    }

    generateSecureRandomInt(min, max) {
        const range = max - min + 1;
        const maxRange = 0x100000000;
        const maxValid = maxRange - (maxRange % range);
        
        let randomValue;
        do {
            randomValue = crypto.randomBytes(4).readUInt32BE(0);
        } while (randomValue >= maxValid);
        
        return min + (randomValue % range);
    }

    getResult(userValue) {
        if (this.computerValue === null || this.key === null) {
            throw new Error("Random selection not prepared");
        }
        
        const result = (this.computerValue + userValue) % (this.getRangeMax() + 1);
        return {
            result,
            computerValue: this.computerValue,
            key: this.key.toString('hex').toUpperCase()
        };
    }

    getRangeMax() {
        if (this.computerValue === null) {
            throw new Error("Random selection not prepared");
        }
        return this.computerValue > 1 ? 5 : 1;
    }

    reset() {
        this.key = null;
        this.computerValue = null;
        this.hmac = null;
    }
}

class Game {
    constructor(diceList) {
        this.diceList = diceList;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.randomGenerator = new FairRandomGenerator();
        this.currentPlayer = null;
        this.userDice = null;
        this.computerDice = null;
    }

    async start() {
        try {
            console.log("Let's determine who makes the first move.");
            await this.determineFirstMove();
            
            if (this.currentPlayer === 'computer') {
                await this.computerSelectDice();
            }
            
            await this.userSelectDice();
            
            if (this.currentPlayer === 'user') {
                await this.computerSelectDice();
            }
            
            await this.playRound();
            
            this.rl.close();
        } catch (error) {
            console.error(error.message);
            this.rl.close();
        }
    }

    async determineFirstMove() {
        const hmac = this.randomGenerator.prepareRandomSelection(1);
        console.log(`I selected a random value in the range 0..1 (HMAC=${hmac}).`);
        console.log("Try to guess my selection.");
        console.log("0 - 0");
        console.log("1 - 1");
        console.log("X - exit");
        console.log("? - help");
        
        const userChoice = await this.prompt("Your selection: ");
        
        if (userChoice.toLowerCase() === 'x') {
            throw new Error("Game exited by user");
        }
        
        if (userChoice === '?') {
            this.showHelp();
            return this.determineFirstMove();
        }
        
        const userValue = parseInt(userChoice, 10);
        if (isNaN(userValue)) {
            console.log("Invalid selection. Please enter 0, 1, X, or ?");
            return this.determineFirstMove();
        }
        
        const result = this.randomGenerator.getResult(userValue);
        console.log(`My selection: ${result.computerValue} (KEY=${result.key}).`);
        
        this.currentPlayer = result.result === 0 ? 'computer' : 'user';
        console.log(`${this.currentPlayer === 'computer' ? 'I' : 'You'} make the first move.`);
        this.randomGenerator.reset();
    }

    async computerSelectDice() {
        const availableDice = this.diceList.filter(dice => 
            !this.userDice || dice !== this.userDice.dice
        );
        
        const randomIndex = this.randomGenerator.generateSecureRandomInt(0, availableDice.length - 1);
        this.computerDice = {
            dice: availableDice[randomIndex],
            index: this.diceList.indexOf(availableDice[randomIndex])
        };
        
        console.log(`I choose the ${this.computerDice.dice.toString()} dice.`);
    }

    async userSelectDice() {
        console.log("Choose your dice:");
        this.diceList.forEach((dice, index) => {
            if (!this.computerDice || index !== this.computerDice.index) {
                console.log(`${index} - ${dice.toString()}`);
            }
        });
        console.log("X - exit");
        console.log("? - help");
        
        const userChoice = await this.prompt("Your selection: ");
        
        if (userChoice.toLowerCase() === 'x') {
            throw new Error("Game exited by user");
        }
        
        if (userChoice === '?') {
            this.showHelp();
            return this.userSelectDice();
        }
        
        const diceIndex = parseInt(userChoice, 10);
        if (isNaN(diceIndex)) {
            console.log("Invalid selection. Please enter a valid number, X, or ?");
            return this.userSelectDice();
        }
        
        if (diceIndex < 0 || diceIndex >= this.diceList.length) {
            console.log(`Invalid dice index. Please select between 0 and ${this.diceList.length - 1}.`);
            return this.userSelectDice();
        }
        
        if (this.computerDice && diceIndex === this.computerDice.index) {
            console.log("This dice is already selected by the computer. Please choose another one.");
            return this.userSelectDice();
        }
        
        this.userDice = {
            dice: this.diceList[diceIndex],
            index: diceIndex
        };
        
        console.log(`You choose the ${this.userDice.dice.toString()} dice.`);
    }

    async playRound() {
        if (this.currentPlayer === 'computer') {
            await this.computerRoll();
            await this.userRoll();
        } else {
            await this.userRoll();
            await this.computerRoll();
        }
        
        this.determineWinner();
    }

    async computerRoll() {
        console.log("It's time for my roll.");
        const hmac = this.randomGenerator.prepareRandomSelection(this.computerDice.dice.getFaces() - 1);
        console.log(`I selected a random value in the range 0..${this.computerDice.dice.getFaces() - 1} (HMAC=${hmac}).`);
        console.log("Add your number modulo " + this.computerDice.dice.getFaces() + ".");
        
        for (let i = 0; i < this.computerDice.dice.getFaces(); i++) {
            console.log(`${i} - ${i}`);
        }
        console.log("X - exit");
        console.log("? - help");
        
        const userChoice = await this.prompt("Your selection: ");
        
        if (userChoice.toLowerCase() === 'x') {
            throw new Error("Game exited by user");
        }
        
        if (userChoice === '?') {
            this.showHelp();
            return this.computerRoll();
        }
        
        const userValue = parseInt(userChoice, 10);
        if (isNaN(userValue)) {
            console.log("Invalid selection. Please enter a valid number, X, or ?");
            return this.computerRoll();
        }
        
        if (userValue < 0 || userValue >= this.computerDice.dice.getFaces()) {
            console.log(`Invalid value. Please select between 0 and ${this.computerDice.dice.getFaces() - 1}.`);
            return this.computerRoll();
        }
        
        const result = this.randomGenerator.getResult(userValue);
        console.log(`My number is ${result.computerValue} (KEY=${result.key}).`);
        console.log(`The fair number generation result is ${result.computerValue} + ${userValue} = ${result.result} (mod ${this.computerDice.dice.getFaces()}).`);
        
        const rollResult = this.computerDice.dice.roll(result.result);
        console.log(`My roll result is ${rollResult}.`);
        this.computerRollResult = rollResult;
        this.randomGenerator.reset();
    }

    async userRoll() {
        console.log("It's time for your roll.");
        const hmac = this.randomGenerator.prepareRandomSelection(this.userDice.dice.getFaces() - 1);
        console.log(`I selected a random value in the range 0..${this.userDice.dice.getFaces() - 1} (HMAC=${hmac}).`);
        console.log("Add your number modulo " + this.userDice.dice.getFaces() + ".");
        
        for (let i = 0; i < this.userDice.dice.getFaces(); i++) {
            console.log(`${i} - ${i}`);
        }
        console.log("X - exit");
        console.log("? - help");
        
        const userChoice = await this.prompt("Your selection: ");
        
        if (userChoice.toLowerCase() === 'x') {
            throw new Error("Game exited by user");
        }
        
        if (userChoice === '?') {
            this.showHelp();
            return this.userRoll();
        }
        
        const userValue = parseInt(userChoice, 10);
        if (isNaN(userValue)) {
            console.log("Invalid selection. Please enter a valid number, X, or ?");
            return this.userRoll();
        }
        
        if (userValue < 0 || userValue >= this.userDice.dice.getFaces()) {
            console.log(`Invalid value. Please select between 0 and ${this.userDice.dice.getFaces() - 1}.`);
            return this.userRoll();
        }
        
        const result = this.randomGenerator.getResult(userValue);
        console.log(`My number is ${result.computerValue} (KEY=${result.key}).`);
        console.log(`The fair number generation result is ${result.computerValue} + ${userValue} = ${result.result} (mod ${this.userDice.dice.getFaces()}).`);
        
        const rollResult = this.userDice.dice.roll(result.result);
        console.log(`Your roll result is ${rollResult}.`);
        this.userRollResult = rollResult;
        this.randomGenerator.reset();
    }

    determineWinner() {
        if (this.userRollResult > this.computerRollResult) {
            console.log(`You win (${this.userRollResult} > ${this.computerRollResult})!`);
        } else if (this.userRollResult < this.computerRollResult) {
            console.log(`I win (${this.computerRollResult} > ${this.userRollResult})!`);
        } else {
            console.log(`It's a tie (${this.userRollResult} = ${this.computerRollResult})!`);
        }
    }

    showHelp() {
        const probabilities = ProbabilityCalculator.calculateProbabilities(this.diceList);
        const table = ProbabilityTable.generateTable(this.diceList, probabilities);
        console.log("\nProbabilities table (row dice beats column dice):");
        console.log(table);
        console.log("X - exit the game");
        console.log("? - show this help\n");
    }

    prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }
}

try {
    const diceList = DiceParser.parse(process.argv);
    const game = new Game(diceList);
    game.start();
} catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
}