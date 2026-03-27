#!/usr/bin/env python3
"""Test all 13 dimension JSON rules against expected results.
Uses the same test cases as test_all_dims.py but runs through the rule engine."""
import json, os

# === Rule Engine (Python, supports both ref/match and field/value) ===
def get_answer(ref, side, obs):
    if side:
        k = f'{ref}_{side}'
        if k in obs: return obs[k]
        return obs.get(ref, '')
    return obs.get(ref, '')

def evaluate(node, obs, side=None, pr=None):
    if pr is None: pr = {}
    if not node: return False

    ref = node.get('ref')
    match = node.get('match')
    op = node.get('op')

    # Leaf: match
    if ref is not None and match is not None:
        eff = node.get('side', side) if 'side' in node else side
        ans = get_answer(ref, eff, obs)
        if isinstance(match, list): return ans in match
        return ans == match

    # partResult
    if 'partResult' in node:
        p = node['partResult']
        if '.' in p:
            pn, sub = p.split('.', 1)
            return pr.get(pn, {}).get(sub, False)
        return pr.get(p, {}).get('result') == 'positive'

    # Inline rule
    if 'rule' in node and 'veto' not in node:
        return evaluate(node['rule'], obs, side, pr)

    # VETO
    if 'veto' in node:
        for v in node['veto']:
            if evaluate(v['condition'], obs, side, pr):
                return v['result'] == 'positive'
        if 'rule' in node:
            return evaluate(node['rule'], obs, side, pr)
        return False

    items = node.get('items', [])
    if op == 'AND':
        return all(evaluate(it, obs, side, pr) for it in items)
    if op == 'OR':
        return any(evaluate(it, obs, side, pr) for it in items)
    if op == 'COUNT':
        return sum(it.get('weight',1) for it in items if evaluate(it, obs, side, pr)) >= node['min']
    if op == 'LR':
        lr = evaluate(node['each'], obs, 'L', pr)
        rr = evaluate(node['each'], obs, 'R', pr)
        evaluate._lr = {'L': lr, 'R': rr}
        return (lr or rr) if node['merge'] == 'any' else (lr and rr)
    return False

evaluate._lr = None

def eval_part(pdef, obs, pr):
    if not pdef: return {'result': 'negative'}
    rule = pdef.get('rule', pdef)
    has = any(k in pdef for k in ('rule','op','type','items','ref','field'))
    if not has: return {'result': 'negative'}
    if 'veto' in pdef:
        for v in pdef['veto']:
            if evaluate(v['condition'], obs, None, pr):
                return {'result': v['result']}
    evaluate._lr = None
    r = evaluate(rule, obs, None, pr)
    out = {'result': 'positive' if r else 'negative'}
    if evaluate._lr:
        out['L'] = evaluate._lr['L']
        out['R'] = evaluate._lr['R']
    return out

def eval_dim(ddef, obs):
    order = ['頭','上停','耳','眉','眼','鼻','口','中停','下停']
    pr = {}
    for pn in order:
        pd = ddef['parts'].get(pn)
        pr[pn] = eval_part(pd, obs, pr) if pd else {'result': 'negative'}
    pos = sum(1 for pn in order if pr[pn]['result'] == 'positive')
    neg = 9 - pos
    attr = ddef['positiveType'] if pos > neg else ddef['negativeType']
    coeff = min(pos,neg)/max(pos,neg) if max(pos,neg)>0 else 0
    return {'results': pr, 'pos': pos, 'neg': neg, 'attr': attr, 'coeff': coeff}

# Load all dims
dims = {}
rdir = os.path.join(os.path.dirname(__file__) or '.', 'rules')
for f in sorted(os.listdir(rdir)):
    if f.endswith('.json'):
        d = json.load(open(os.path.join(rdir, f)))
        dims[d['dimIndex']] = d

passes = 0; fails = 0
def run(name, desc, obs, di, part, expected):
    global passes, fails
    r = eval_dim(dims[di], obs)
    actual = 'A' if r['results'][part]['result'] == 'positive' else 'B'
    ok = actual == expected
    if ok: passes += 1
    else:
        fails += 1
        pn = dims[di]['positive']
        nn = dims[di]['negative']
        print(f'[{name}] {desc}')
        print(f'  預期: {part}={expected}({pn if expected=="A" else nn})  實際: {actual}({pn if actual=="A" else nn})  FAIL')
        # Show LR sub if available
        pr = r['results'][part]
        if 'L' in pr or 'R' in pr:
            print(f'  L={pr.get("L")} R={pr.get("R")}')

# Map part names to old-style indices for reference
# partIdx: 0=頭 1=上停 2=中停 3=下停 4=耳 5=眉 6=眼 7=鼻 8=口

# ===== DIM 0 形勢 =====
run('01-上停-A','形（4全中）',{'e1':'額高','e3':'額寬','e4':'額平','e6':'額隆'},0,'上停','A')
run('01-上停-B','勢（缺額高）',{'e1':'額低','e3':'額寬','e4':'額平','e6':'額隆'},0,'上停','B')
run('01-上停-C','形（大天庭替額隆）',{'e1':'額高','e3':'額寬','e4':'額平','e11':'大天庭'},0,'上停','A')
run('01-口-A','口形（4全中）',{'m1':'口開大合小','m2':'涯岸分明','m3':'嘴角收','m4':'嘴角朝上'},0,'口','A')
run('01-口-B','口勢（水平）',{'m1':'口開大合小','m2':'涯岸分明','m3':'嘴角收','m4':'嘴角水平'},0,'口','B')
run('01-頭-A','頭形（3分）',{'h1_L':'龜背','h1_R':'龜背','h5':'後腦圓','h6':'順無凹凸','h7':'無自剋骨','h8':'無橫條骨'},0,'頭','A')
run('01-頭-B','頭勢（2分）',{'h1_L':'龜背','h1_R':'平寬','h5':'後腦圓','h6':'順無凹凸','h7':'無自剋骨','h8':'無橫條骨'},0,'頭','B')

# ===== DIM 1 經緯 =====
run('02-上停-A','經（額隆）',{'e6':'額隆'},1,'上停','A')
run('02-上停-B','緯（無）',{'e6':'額均','e13':'不清晰'},1,'上停','B')
run('02-眼-A','眼經（5+一致）',{'ey3_L':'眼細','ey1_L':'眼長','ey4_L':'眼尾平','ey6_L':'有眼鉤','ey7_L':'有刀裁','ey3_R':'眼細','ey1_R':'眼長','ey4_R':'眼尾平','ey6_R':'有眼鉤','ey7_R':'有刀裁','ey12':'雙眼一致'},1,'眼','A')
run('02-眼-B','眼緯（缺一致）',{'ey3_L':'眼細','ey1_L':'眼長','ey4_L':'眼尾平','ey6_L':'有眼鉤','ey7_L':'有刀裁','ey3_R':'眼細','ey1_R':'眼長','ey4_R':'眼尾平','ey6_R':'有眼鉤','ey7_R':'有刀裁','ey12':'雙眼不一致'},1,'眼','B')

# ===== DIM 2 方圓 (positive=圓=B in old code, A in engine) =====
run('03-眼-A','眼圓',{'ey8_L':'眼上弧','ey6_L':'有眼鉤','ey8_R':'眼上弧','ey7_R':'有刀裁','ey12':'雙眼一致'},2,'眼','A')
run('03-眼-B','眼方',{'ey8_L':'眼上弧','ey6_L':'無眼鉤','ey7_L':'無刀裁','ey12':'雙眼一致'},2,'眼','B')

# ===== DIM 3 曲直 (positive=直=B in old, A in engine) =====
run('04-頭-A','頭直（3分）',{'h4':'中線直','h9':'中線直'},3,'頭','A')
run('04-頭-B','頭曲（2分）',{'h4':'中線直','h9':'中線歪'},3,'頭','B')
run('04-頭-D','頭直（枕+兩華陽=3）',{'h4':'中線歪','h9':'中線直','h11_L':'平直','h11_R':'平直'},3,'頭','A')
run('04-眼-A','眼直（4全中）',{'ey3_L':'眼細','ey1_L':'眼長','ey6_L':'無眼鉤','ey7_L':'無刀裁','ey3_R':'眼細','ey1_R':'眼長','ey6_R':'無眼鉤','ey7_R':'無刀裁'},3,'眼','A')
run('04-眼-B','眼曲（有鉤）',{'ey3_L':'眼細','ey1_L':'眼長','ey6_L':'有眼鉤','ey7_L':'無刀裁'},3,'眼','B')

# ===== DIM 4 收放 =====
run('05-上停-A','收（小天庭）',{'e11':'小天庭'},4,'上停','A')
run('05-上停-B','放（大天庭）',{'e11':'大天庭','e14':'日月角開'},4,'上停','B')
run('05-口-A','口收（4全中）',{'m3':'嘴角收','m4':'嘴角朝上','m7':'閉合線密','m2':'涯岸分明'},4,'口','A')
run('05-口-B','口放（朝下）',{'m3':'嘴角收','m4':'嘴角朝下','m7':'閉合線密','m2':'涯岸分明'},4,'口','B')

# ===== DIM 5 緩急 =====
run('06-眉-A','眉緩（5全中）',{'br2_L':'眉形細','br1_L':'眉長','br15_L':'柔順','br14_L':'眉順','br19_L':'不沖印','br2_R':'眉形細','br1_R':'眉長','br15_R':'柔順','br14_R':'眉順','br19_R':'不沖印'},5,'眉','A')
run('06-眉-B','眉急（左缺1）',{'br2_L':'眉形細','br1_L':'眉長','br15_L':'柔順','br14_L':'眉順','br19_L':'沖印','br2_R':'眉形細','br1_R':'眉長','br15_R':'柔順','br14_R':'眉順','br19_R':'不沖印'},5,'眉','B')

# ===== DIM 6 順逆 =====
run('07-眉-A','眉順（5全中）',{'br1_L':'眉長','br3_L':'眉彎','br4_L':'無鷹角','br14_L':'眉順','br15_L':'柔順','br1_R':'眉長','br3_R':'眉彎','br4_R':'無鷹角','br14_R':'眉順','br15_R':'柔順'},6,'眉','A')
run('07-眼-A','眼順（3全中）',{'ey3_L':'眼細','ey1_L':'眼長','ey11_L':'上下不白','ey3_R':'眼細','ey1_R':'眼長','ey11_R':'上下不白'},6,'眼','A')
run('07-眼-B','眼逆',{'ey3_L':'眼細','ey1_L':'眼長','ey11_L':'上三白'},6,'眼','B')

# ===== DIM 7 分合 (positive=合=B in old, A in engine) =====
run('08-上停-A','合（大天庭）',{'e11':'大天庭'},7,'上停','A')
run('08-上停-B','合（小天庭+不清晰）',{'e11':'小天庭','e13':'不清晰'},7,'上停','A')
run('08-上停-C','分（小天庭+日月角起）',{'e11':'小天庭','e13':'日月角起'},7,'上停','B')

# ===== DIM 8 真假 =====
run('09-頭-A','頭真（一致+3分）',{'h3':'左右一致','h1_L':'龜背','h1_R':'龜背','h6':'順無凹凸','h7':'無自剋骨','h8':'無橫條骨'},8,'頭','A')
run('09-頭-B','頭假（不一致）',{'h3':'左右不一致','h1_L':'龜背','h1_R':'龜背','h6':'順無凹凸','h7':'無自剋骨','h8':'無橫條骨'},8,'頭','B')
run('09-頭-C','頭假（一致但2分）',{'h3':'左右一致','h1_L':'龜背','h1_R':'平寬','h6':'有凹凸','h7':'無自剋骨','h8':'無橫條骨'},8,'頭','B')

# ===== DIM 9 攻守 (already tested extensively) =====
run('10-0-A','頭攻（頭硬）',{'h15':'偏硬'},9,'頭','A')
run('10-0-B','頭守',{'h15':'一般','h2':'平順','h7':'無自剋骨','h8':'無橫條骨','h11_L':'圓隆','h11_R':'圓隆'},9,'頭','B')
run('10-5-A','眉攻（3/4）',{'br4_L':'有鷹角','br16_L':'眉毛稀少','br15_L':'質硬','br8_L':'平'},9,'眉','A')
run('10-5-B','眉守（2/4）',{'br4_L':'有鷹角','br8_L':'有揚','br16_L':'眉毛多','br15_L':'柔順','br4_R':'有鷹角','br8_R':'平','br16_R':'眉毛多','br15_R':'柔順'},9,'眉','B')
run('10-6-E','眼守（大圓尾不上）',{'ey2_R':'眼大','ey3_R':'眼圓','ey4_R':'眼尾平'},9,'眼','B')

# ===== DIM 10 奇正 =====
run('11-耳-A','耳奇（左耳提強+右招風）',{'er3_L':'耳提強','er5_R':'招風耳'},10,'耳','A')
run('11-耳-B','耳正（只左耳）',{'er3_L':'耳提強'},10,'耳','B')
run('11-眉-A','眉奇（左右揚）',{'br8_L':'有揚','br8_R':'有揚'},10,'眉','A')
run('11-眉-B','眉正（只左鷹角）',{'br4_L':'有鷹角','br4_R':'無鷹角','br8_R':'平'},10,'眉','B')
run('11-鼻-A','鼻奇（長+橫張）',{'n1':'鼻長','n8':'有橫張'},10,'鼻','A')
run('11-鼻-B','鼻正',{'n1':'鼻長','n8':'無橫張'},10,'鼻','B')
run('11-口-A','口奇',{'m7':'閉合線密','m3':'嘴角收'},10,'口','A')
run('11-口-B','口正',{'m3':'嘴角收','m7':'放鬆見齒'},10,'口','B')

# ===== DIM 11 虛實 (positive=實=B in old, A in engine) =====
run('12-耳-A','耳實（8全中）',{'er8_L':'有輪有廓','er9_L':'輪包廓','er4_L':'耳圓','er7_L':'耳高','er8_R':'有輪有廓','er9_R':'輪包廓','er4_R':'耳圓','er7_R':'耳高'},11,'耳','A')
run('12-耳-B','耳虛（7）',{'er8_L':'有輪有廓','er9_L':'輪包廓','er4_L':'耳圓','er7_L':'耳低','er8_R':'有輪有廓','er9_R':'輪包廓','er4_R':'耳圓','er7_R':'耳高'},11,'耳','B')
run('12-鼻-A','鼻實',{'n10':'骨肉勻稱','n11':'無起節'},11,'鼻','A')
run('12-鼻-B','鼻虛（有起節）',{'n10':'骨肉勻稱','n11':'有起節突露'},11,'鼻','B')
run('12-鼻-C','鼻虛（肉多）',{'n10':'肉多於骨','n11':'無起節'},11,'鼻','B')
run('12-口-A','口實（收+大）',{'m3':'嘴角收','m1':'口開大合小'},11,'口','A')
run('12-口-B','口實（收+適中）',{'m3':'嘴角收','m1':'口適中'},11,'口','A')
run('12-口-C','口虛（收+小）',{'m3':'嘴角收','m1':'口小'},11,'口','B')
run('12-下停-A','下停虛（地閣凹）',{'m3':'嘴角收','m1':'口開大合小','p1':'人中深','c2':'地閣凹','y1_L':'頤寬','y1_R':'頤寬'},11,'下停','B')
run('12-下停-B','下停虛（頤削）',{'m3':'嘴角收','m1':'口開大合小','p1':'人中深','c2':'地閣平','y1_L':'頤削','y1_R':'頤寬'},11,'下停','B')

# ===== DIM 12 進退 =====
run('13-上停-A','進（額方）',{'e8':'額方'},12,'上停','A')
run('13-上停-B','退（額長）',{'e8':'額長'},12,'上停','B')
run('13-眼-A','眼進（左短）',{'ey1_L':'眼短'},12,'眼','A')
run('13-眼-B','眼退（左右長）',{'ey1_L':'眼長','ey1_R':'眼長'},12,'眼','B')
run('13-鼻-A','鼻進（無起節）',{'n11':'無起節'},12,'鼻','A')
run('13-鼻-B','鼻進（鼻肉）',{'n10':'肉多於骨'},12,'鼻','A')
run('13-鼻-C','鼻退',{'n1':'鼻長','n4':'鼻寬','n11':'有起節突露','n10':'骨多於肉'},12,'鼻','B')
run('13-頭-A','頭退（頭窄=2分）',{'h14':'頭窄','h10':'兩側一致','h7':'無自剋骨','h8':'無橫條骨','h11_L':'圓隆','h11_R':'圓隆'},12,'頭','B')
run('13-頭-B','頭進（頭窄+不一致=3分）',{'h14':'頭窄','h10':'兩側不一致'},12,'頭','A')

# ===== Summary =====
total = passes + fails
print(f'\n{"="*50}')
print(f'Rule Engine Test: {total} cases, {passes} PASS, {fails} FAIL')
if fails == 0:
    print('All tests passed!')
else:
    print(f'{fails} failures found - check output above')
    exit(1)
