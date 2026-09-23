export const sampleMarkdown = String.raw`# Harrod-Domar Growth Model

ECON 240, Todaro & Smith Ch 3, section 3.2

> [!EXAM] This section feeds **calculate** questions (plug numbers into $g = s/c$) and **explain** questions (walk through saving, then investment, then capital, then output, then growth). Examiners give marks for each step, not just the final line.

## 1. The big idea

Rostow said every country passes through five stages, and the way to reach ==takeoff== is to **save and invest a lot**. Harrod-Domar is the maths that shows *why* saving leads to growth and *how much* growth you get.

> [!DEF] **Capital fundamentalism:** the view that capital (machines, factories, buildings) is the whole answer to development. *Not to be confused with:* structural-change theory, which says capital is needed but other changes are needed too.

> [!SOURCE] Open **Todaro & Smith p.120** now and read the Rostow quote (about half a page). Then come back here.

## 2. The letters, defined before we use them

| Symbol | Meaning | Example value |
| --- | --- | --- |
| $Y$ | GDP, total output in a year | Rs 100bn |
| $S$ | total saving in the year | Rs 6bn |
| $s$ | saving rate, saving as a share of GDP | 6% |
| $I$ | investment, spending on new machines and factories | Rs 6bn |
| $K$ | capital stock, all machines the country has | |
| $\Delta$ | “change in” | |
| $c$ | capital-output ratio: rupees of machines needed per rupee of output per year | 3 |
| $\delta$ | depreciation rate, share of machines that wear out each year | 2% |

> [!DEF] **Capital-output ratio ($c$):** units of capital needed to produce one unit of output over a period. *Not to be confused with:* the capital-labour ratio ($k = K/L$) in the Solow model.

## 3. The derivation, step by step

> [!STEPS]
>
> 1. Saving is a share of GDP: $S = sY = 0.06 \times 100 = \text{Rs } 6\text{bn}$
> 2. Everything saved is invested: $S = I = \text{Rs } 6\text{bn}$
> 3. Investment adds to the capital stock: $I = \Delta K = \text{Rs } 6\text{bn}$
> 4. New capital makes new output: $\Delta Y = \Delta K / c = 6 / 3 = \text{Rs } 2\text{bn}$
> 5. Growth rate: $\Delta Y / Y = 2 / 100 = 2\%$

All five steps collapse into one equation:

$$
\frac{\Delta Y}{Y} = \frac{s}{c}
$$

With depreciation, using the gross saving rate $s_G$:

$$
\begin{aligned}
\frac{\Delta Y}{Y} &= \frac{s_G}{c} - \delta \\
&= \frac{15\%}{3} - 2\% \\
&= 3\%
\end{aligned}
$$

> [!SOURCE] Now open **p.121 to 122** (equations 3.1 to 3.7). The algebra there matches steps 1 to 5 above, one for one.

## 4. Two ways to grow faster

> [!EXAMPLE] **Raise $s$:** saving goes from 6% to 15% with $c = 3$, so growth goes from 2% to **5%**. This is Rostow's takeoff.
>
> **Lower $c$:** use machines better so $c$ falls from 3 to 2, with $s$ still 6%. Growth rises to **3%**. The school mostly ignored this lever.

A quick way to check any of these numbers:

~~~python
def hd_growth(s, c, delta=0.0):
    """Harrod-Domar growth rate. s and delta as decimals."""
    return s / c - delta

print(hd_growth(0.06, 3))        # 0.02 -> 2%
print(hd_growth(0.15, 3, 0.02))  # 0.03 -> 3%
~~~

## 5. The savings gap

> [!EXAMPLE] Target growth is 7%, and $c = 3$. The saving rate needed is $7\% \times 3 = 21\%$. The country only saves 15%. The **savings gap** is $21\% - 15\% = 6\%$ of GDP. Foreign aid or foreign investment fills the gap. **Pakistan:** low domestic saving filled by external loans and IMF programmes (check the exact saving rate in the latest Pakistan Economic Survey before writing it).

> [!TRAP] Old ICP keys write $g = s/k$. That $k$ means capital-**output** ratio, *not* Solow's capital-**labour** ratio. Always write $c$ in your answers.

## 6. Why it failed

> [!ARGUMENT] **Claim (stages school):** more saving and investment is enough for growth. The Marshall Plan rebuilt Europe this way.
>
> **Counter-claim (Todaro & Smith):** saving is **necessary but not sufficient**. Europe already had educated workers, working markets, transport and a capable government, so new capital became output. Many poor countries lack these, so $c$ stays high and growth doesn't come. **Pakistan:** CPEC-era power plants added capital, but idle capacity and circular debt meant output didn't follow.

> [!DEF] **Necessary condition:** must be present, but doesn't guarantee the result (petrol for a car). **Sufficient condition:** guarantees the result if present.

## 7. Quick check

> [!CHECK]
>
> 1. GDP is Rs 200bn, $s = 10\%$, $c = 4$. Find saving, investment, extra output and growth.
> 2. Same country wants 5% growth. What saving rate does it need, and what is the gap?
>
> **Answers:** (1) $S = I = \Delta K =$ Rs 20bn, $\Delta Y =$ Rs 5bn, growth $= 2.5\%$. (2) $5\% \times 4 = 20\%$, so the gap is $20\% - 10\% = 10\%$ of GDP.

> [!NOTE] This box uses an unknown tag on purpose. It should render as a neutral grey box, not break the page.
`;
