import {describe, it, expect, vi} from 'vitest'
import {extractQASteps, isQAComment} from '../../src/services/github.js'

vi.mock('../../src/services/shell.js', () => ({
  exec: vi.fn().mockResolvedValue({stdout: 'fake-gh-token', stderr: '', exitCode: 0}),
}))

describe('extractQASteps', () => {
  it('estrae step non completati', () => {
    const body = '- [ ] Testare login\n- [ ] Verificare logout'
    expect(extractQASteps(body)).toEqual([
      {text: 'Testare login', checked: false},
      {text: 'Verificare logout', checked: false},
    ])
  })

  it('estrae step completati con [x]', () => {
    const body = '- [x] Step completato\n- [X] Altro step maiuscolo'
    expect(extractQASteps(body)).toEqual([
      {text: 'Step completato', checked: true},
      {text: 'Altro step maiuscolo', checked: true},
    ])
  })

  it('gestisce mix di step completati e non', () => {
    const body = '- [x] Primo\n- [ ] Secondo\n- [x] Terzo'
    expect(extractQASteps(body)).toEqual([
      {text: 'Primo', checked: true},
      {text: 'Secondo', checked: false},
      {text: 'Terzo', checked: true},
    ])
  })

  it('ignora righe di testo normale', () => {
    const body = 'Testo normale\n- [ ] Solo questo\nAltro testo'
    expect(extractQASteps(body)).toEqual([{text: 'Solo questo', checked: false}])
  })

  it('restituisce array vuoto se nessuna checklist', () => {
    expect(extractQASteps('LGTM! Nessun problema.')).toEqual([])
  })

  it('gestisce indentazione negli step', () => {
    const body = '  - [ ] Step indentato'
    expect(extractQASteps(body)).toEqual([{text: 'Step indentato', checked: false}])
  })
})

describe('isQAComment', () => {
  it('riconosce autore con "qa" nel username', () => {
    expect(isQAComment('Tutto ok', 'qa-tester')).toBe(true)
  })

  it('riconosce autore con "QA" maiuscolo nel username', () => {
    expect(isQAComment('Approvato', 'QA-engineer')).toBe(true)
  })

  it('riconosce body che inizia con "QA:"', () => {
    expect(isQAComment('QA: review completata')).toBe(true)
  })

  it('riconosce body che contiene "qa review"', () => {
    expect(isQAComment('Ecco la qa review di questo sprint')).toBe(true)
  })

  it('riconosce body che contiene "qa step"', () => {
    expect(isQAComment('Segui i qa step seguenti')).toBe(true)
  })

  it('riconosce body con checklist markdown', () => {
    expect(isQAComment('- [ ] Step da completare')).toBe(true)
    expect(isQAComment('- [x] Step completato')).toBe(true)
  })

  it('non riconosce commenti normali di sviluppatore', () => {
    expect(isQAComment('LGTM!', 'developer1')).toBe(false)
  })

  it('non riconosce commenti senza pattern QA', () => {
    expect(isQAComment('Ho aggiunto i test per questa funzionalità.')).toBe(false)
  })
})
