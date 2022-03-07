import { expect } from 'chai';
import nock from 'nock';

import Canvas from '../lib/canvas.js';
import response from './response.js';

const canvas = new Canvas('https://canvas.test.instructure.com', {'accessToken': 'abc123'});

const api = nock('https://canvas.test.instructure.com');

beforeEach(() => {
    nock.cleanAll();
});

describe('Basic functionality', () => {

    it('makes HTTP GET requests', () => {
        api.get('/api/v1/users/1', () => true).reply(200, response.user1);
        return canvas.get('users/1').then(response => {
            expect(typeof response).to.equal('object');
            expect(response.success);
        });
    });

    it('makes HTTP POST requests', () => {
        api.post('/api/v1/accounts/self/users', () => true).reply(201, response.user1);
        return canvas.post('accounts/self/users', {user: {}, pseudonym: {}, communication_channel: {}}).then(response => {
            expect(typeof response).to.equal('object');
            expect(response.success);
        });
    });

    it('makes HTTP PUT requests', () => {
        api.put('/api/v1/users/1/custom_data?fruit%5Bdata%5D%5Bapple%5D=so%20tasty&fruit%5Bdata%5D%5Bkiwi%5D=a%20bit%20sour&fruit%5Bveggies%5D%5Broot%5D%5Bonion%5D=tear-jerking', () => true).reply(200, response.customdata);
        return canvas.put('users/1/custom_data', {fruit: {data: {apple: 'so tasty', kiwi: 'a bit sour'}, veggies: {root: {onion: 'tear-jerking'}}}}).then(response => {
            expect(typeof response).to.equal('object');
            expect(response.success);
        });
    });

    it('makes HTTP DELETE requests', () => {
        api.delete('/api/v1/users/1/custom_data/fruit/kiwi', () => true).reply(200, response.deleteddata);
        return canvas.delete('users/1/custom_data/fruit/kiwi', {user: {}, pseudonym: {}, communication_channel: {}}).then(response => {
            expect(typeof response).to.equal('object');
            expect(response.success);
        });
    });

    it('handles HTTP errors appropriately', () => {
        api.get('/api/v1/users/2', () => true).reply(404, {errors: [{message: 'User not found'}]});
        return canvas.get('users/2').catch(err => {
            expect(err.message).to.equal('User not found');
            expect(response.error);
        });
    });

});

describe('Paging', () => {

    const linkHeader = '<https://canvas.test.instructure.com/api/v1/accounts/self/users?opaqueA>; rel="current", <https://canvas.test.instructure.com/api/v1/accounts/self/users?opaqueB>; rel="next", <https://canvas.test.instructure.com/api/v1/accounts/self/users?opaqueC>; rel="first", <https://canvas.test.instructure.com/api/v1/accounts/self/users?opaqueD>; rel="last"'
    it('automatically fetches all pages', () => {
        api.get('/api/v1/accounts/self/users', () => true).reply(200, [response.user1], {Link: linkHeader});
        api.get('/api/v1/accounts/self/users?opaqueB=', () => true).reply(200, [response.user1]);
        return canvas.get('/accounts/self/users').then(response => {
            expect(response.length).to.equal(2);
            expect(response.success);
        });
    });

});

describe('Throttling', () => {

     it('waits and retries rate limited requests', () => {
        api.get('/api/v1/users/1', () => true).reply(403, 'Rate Limit Exceeded');
        api.get('/api/v1/users/1', () => true).reply(200, response.user1);
        return canvas.get('users/1').then(response => {
            expect(typeof response).to.equal('object');
            expect(response.success);
        });
    });

    it('waits at least 50 ms when half of rate limit budget is exhausted', () => {
        api.get('/api/v1/users/1', () => true).reply(200, response.user1, {'X-Rate-Limit-Remaining': 100});
        api.get('/api/v1/users/1', () => true).reply(200, response.user1, {'X-Rate-Limit-Remaining': 25});
        api.get('/api/v1/users/1', () => true).reply(200, response.user1, {'X-Rate-Limit-Remaining': 25});
        return canvas.get('users/1').then(() => canvas.get('users/1'))
        .then(() => {
            const start = new Date();
            return canvas.get('users/1').then(response => {
                expect(new Date() - start).to.be.at.least(50);
                expect(typeof response).to.equal('object');
                expect(response.success);
            });
        });
    });

});
