import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getChildText } from '../content/child-text'
import { BopomofoText } from './BopomofoText'

describe('BopomofoText', () => {
  it('把每個中文字與自己的注音組成不可拆開的配對', () => {
    const { container } = render(<BopomofoText entry={getChildText('home.start')} />)
    const pairs = container.querySelectorAll('[data-bopomofo-pair]')

    expect(pairs).toHaveLength(4)
    expect(pairs[0]?.tagName).toBe('SPAN')
    expect(pairs[0]?.querySelector('.bopomofo-pair__annotation')?.tagName).toBe('SPAN')
    expect(pairs[0].querySelector('.bopomofo-pair__hanzi')).toHaveTextContent('開')
    expect(pairs[0].querySelector('.bopomofo-pair__annotation')).toHaveTextContent('ㄎㄞ')
    expect(pairs[1].querySelector('.bopomofo-pair__hanzi')).toHaveTextContent('始')
    expect(pairs[1].querySelector('.bopomofo-pair__annotation')).toHaveTextContent('ㄕˇ')
    expect(pairs[2].querySelector('.bopomofo-pair__hanzi')).toHaveTextContent('冒')
    expect(pairs[2].querySelector('.bopomofo-pair__annotation')).toHaveTextContent('ㄇㄠˋ')
    expect(pairs[3].querySelector('.bopomofo-pair__hanzi')).toHaveTextContent('險')
    expect(pairs[3].querySelector('.bopomofo-pair__annotation')).toHaveTextContent('ㄒㄧㄢˇ')
  })

  it('讓輔助科技優先讀取中文字', () => {
    render(<BopomofoText entry={getChildText('home.start')} />)

    expect(screen.getByLabelText('開始冒險')).toBeInTheDocument()
  })

  it('將輕聲記號放在注音直列上方', () => {
    const { container } = render(<BopomofoText entry={getChildText('home.welcome')} />)
    const neutralTone = container.querySelector('.bopomofo-pair__tone--neutral')

    expect(neutralTone).toHaveTextContent('˙')
  })

  it('標記注音符號數量，讓不同長度可各自校正間距與位移', () => {
    const entry = {
      id: 'test.symbol-counts',
      text_zh_tw: '甲乙丙',
      segments: [
        { text: '甲', bopomofo: 'ㄧ' },
        { text: '乙', bopomofo: 'ㄅㄧˇ' },
        { text: '丙', bopomofo: 'ㄒㄧㄢˊ' },
      ],
      speech_zh_tw: '甲乙丙',
      audio_asset: 'voice/test/symbol-counts',
      audience: 'child' as const,
    }
    const { container } = render(<BopomofoText entry={entry} />)
    const annotations = [...container.querySelectorAll('.bopomofo-pair__annotation')]

    expect(annotations[0]).toHaveClass('bopomofo-pair__annotation--single')
    expect(annotations[1]).toHaveClass('bopomofo-pair__annotation--double')
    expect(annotations[2]).toHaveClass('bopomofo-pair__annotation--triple')
    expect(annotations[2]?.querySelector('.bopomofo-pair__symbols')).toHaveClass('bopomofo-pair__symbols--triple')
    expect(annotations[1]?.querySelector('.bopomofo-pair__tone')).toHaveClass('bopomofo-pair__tone--double')
    expect(annotations[2]?.querySelector('.bopomofo-pair__tone')).toHaveClass('bopomofo-pair__tone--triple')
  })
})
