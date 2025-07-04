import { describe, it, expect } from 'vitest';
// Note: The actual path will depend on your final refactored code.
// Let's assume you created a `parse` function in the parser file.
import { parseFileContent } from '../../src/logic/parser'; 

describe('Content Parser', () => {

    it('should parse a simple question and answer card', () => {
        const mockContent = `
First part of the question.
Second part?srs ^card1
This is the answer.
It can have multiple lines.
?srs(end)
`;
        const { questions } = parseFileContent(mockContent);
        
        expect(questions.length).toBe(1);
        expect(questions[0].id).toBe('card1');
        expect(questions[0].question.trim()).toBe('First part of the question.\nSecond part');
        expect(questions[0].answer.trim()).toBe('This is the answer.\nIt can have multiple lines.');
    });

    it('should parse a cloze deletion card', () => {
        const mockContent = `
A cloze deletion looks like this: {{c1::answer}}.
`;
        const { clozes } = parse(mockContent);

        expect(clozes.length).toBe(1);
        expect(clozes[0].id).toBe('c1');
        expect(clozes[0].answer).toBe('answer');
    });

});