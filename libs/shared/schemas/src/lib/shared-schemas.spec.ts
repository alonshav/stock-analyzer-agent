import { sharedSchemas } from './shared-schemas';

describe('sharedSchemas', () => {
  it('should work', () => {
    expect(sharedSchemas()).toEqual('shared-schemas');
  });
});
