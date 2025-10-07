import { botTelegram } from './bot-telegram';

describe('botTelegram', () => {
  it('should work', () => {
    expect(botTelegram()).toEqual('bot-telegram');
  });
});
