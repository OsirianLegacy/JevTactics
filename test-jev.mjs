import { experimental_evaluate as evaluate } from 'ai';

const result = await evaluate({
    model: 'typesafe-ai/jev',
    state: 'A unit has 8 of 100 health remaining. Three enemies surround it.',
    questions: {
        retreat: {
            type: 'boolean',
            instructions: 'Should the unit retreat to survive?',
        },
    },
});

console.log(JSON.stringify(result.answers, null, 2));