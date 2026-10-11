/*
 * 哈希模块单元测试
 *
 * 标准向量由 Node crypto（OpenSSL）独立生成，覆盖空串、多字节 UTF-8、
 * 以及各算法分组 / 吸收率的边界长度（55/56/57、111/112/113、135/136/137、
 * 143/144/145、71/72/73、103/104/105、215/216/217 …）。
 */
import { describe, expect, it } from "vitest";
import {
  HASH_ALGORITHMS,
  HashCancelledError,
  createHasher,
  formatDigest,
  hashFile,
  hashText,
  matchesExpected,
  type HashAlgorithm,
} from "../src/hash";
import { bytesToHex, utf8Bytes } from "../src/hash/core";

type Vector = [input: string, expected: string];

/** 通用输入（覆盖 64 字节分组与 UTF-8） */
const COMMON: Vector[] = [
  ["", ""], // 占位，实际在表内逐条列出
];

/** 32 位族（MD5 / SHA-1 / SHA-224 / SHA-256 / SM3）：64 字节分组边界 55/56/57 与 111/112/113 */
const W64: Vector[] = [
  ["", ""],
  ["abc", ""],
  ["The quick brown fox jumps over the lazy dog", ""],
  ["你好", ""],
  ["a".repeat(55), ""],
  ["a".repeat(56), ""],
  ["a".repeat(57), ""],
  ["a".repeat(63), ""],
  ["a".repeat(64), ""],
  ["a".repeat(65), ""],
  ["a".repeat(111), ""],
  ["a".repeat(112), ""],
  ["a".repeat(113), ""],
  ["0123456789".repeat(5), ""],
];

/** 64 位族（SHA-384 / SHA-512）：128 字节分组边界 111/112/113 与 127/128/129 */
const W128: Vector[] = [
  ["", ""],
  ["abc", ""],
  ["你好", ""],
  ["a".repeat(111), ""],
  ["a".repeat(112), ""],
  ["a".repeat(113), ""],
  ["a".repeat(127), ""],
  ["a".repeat(128), ""],
  ["a".repeat(129), ""],
  ["a".repeat(135), ""],
  ["a".repeat(136), ""],
  ["a".repeat(137), ""],
];

/** SHA-3 族：吸收率边界（72/104/136/144 的 -1/0/+1） */
const SHA3: Vector[] = [
  ["", ""],
  ["abc", ""],
  ["你好", ""],
  ["b".repeat(71), ""],
  ["b".repeat(72), ""],
  ["b".repeat(73), ""],
  ["b".repeat(103), ""],
  ["b".repeat(104), ""],
  ["b".repeat(105), ""],
  ["a".repeat(135), ""],
  ["a".repeat(136), ""],
  ["a".repeat(137), ""],
  ["a".repeat(143), ""],
  ["a".repeat(144), ""],
  ["a".repeat(145), ""],
  ["b".repeat(215), ""],
  ["b".repeat(216), ""],
  ["b".repeat(217), ""],
];

/** 期望值由 Node crypto（OpenSSL）生成的权威向量，按 [算法, 输入] 索引 */
const EXPECTED: Record<string, string> = {
  // MD5（W64 顺序）
  "MD5|": "d41d8cd98f00b204e9800998ecf8427e",
  "MD5|abc": "900150983cd24fb0d6963f7d28e17f72",
  "MD5|fox": "9e107d9d372bb6826bd81d3542a419d6",
  "MD5|你好": "7eca689f0d3389d9dea66ae112e5cfd7",
  "MD5|a55": "ef1772b6dff9a122358552954ad0df65",
  "MD5|a56": "3b0c8ac703f828b04c6c197006d17218",
  "MD5|a57": "652b906d60af96844ebd21b674f35e93",
  "MD5|a63": "b06521f39153d618550606be297466d5",
  "MD5|a64": "014842d480b571495a4a0363793f7367",
  "MD5|a65": "c743a45e0d2e6a95cb859adae0248435",
  "MD5|a111": "089f243d1e831c5879aa375ee364a06e",
  "MD5|a112": "9146ef3527c7cfcc66dc615c3986e391",
  "MD5|a113": "d727cfdfc9ed0347e6917a68b982f7bc",
  "MD5|digits": "baed005300234f3d1503c50a48ce8e6f",
  // SHA-1
  "SHA-1|": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  "SHA-1|abc": "a9993e364706816aba3e25717850c26c9cd0d89d",
  "SHA-1|fox": "2fd4e1c67a2d28fced849ee1bb76e7391b93eb12",
  "SHA-1|你好": "440ee0853ad1e99f962b63e459ef992d7c211722",
  "SHA-1|a55": "c1c8bbdc22796e28c0e15163d20899b65621d65a",
  "SHA-1|a56": "c2db330f6083854c99d4b5bfb6e8f29f201be699",
  "SHA-1|a57": "f08f24908d682555111be7ff6f004e78283d989a",
  "SHA-1|a63": "03f09f5b158a7a8cdad920bddc29b81c18a551f5",
  "SHA-1|a64": "0098ba824b5c16427bd7a1122a5a442a25ec644d",
  "SHA-1|a65": "11655326c708d70319be2610e8a57d9a5b959d3b",
  "SHA-1|a111": "ac877859d427d9192054eea8feb3b8a403ef83a5",
  "SHA-1|a112": "689993727ba37386bb032495e9dbdfb4dd1ba744",
  "SHA-1|a113": "3bcfff44cf3237b9b63c661a530077f794872efc",
  "SHA-1|digits": "9578f951955d37f20b601c26591e260c1e5389bf",
  // SHA-224
  "SHA-224|": "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f",
  "SHA-224|abc": "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7",
  "SHA-224|fox": "730e109bd7a8a32b1cb9d9a09aa2325d2430587ddbc0c38bad911525",
  "SHA-224|你好": "e91f006ed4e0882de2f6a3c96ec228a6a5c715f356d00091bce842b5",
  "SHA-224|a55": "fb0bd626a70c28541dfa781bb5cc4d7d7f56622a58f01a0b1ddd646f",
  "SHA-224|a56": "d40854fc9caf172067136f2e29e1380b14626bf6f0dd06779f820dcd",
  "SHA-224|a57": "b5d09534784ab6578128bce7f28a96a56e3b45c4f734f74739076249",
  "SHA-224|a63": "1d4e051f4d6fed2a63fd2421e65834cec00d64456553de3496ae8b1d",
  "SHA-224|a64": "a88cd5cde6d6fe9136a4e58b49167461ea95d388ca2bdb7afdc3cbf4",
  "SHA-224|a65": "ff8716f600af42959d0efb52e1f21b01bb328733009344d511c299fb",
  "SHA-224|a111": "4aeec1a49b2c1bc663abf2809b36faaa64359523d4f26d02dbc2cba3",
  "SHA-224|a112": "0336b66821946e7f1052102e3b9c29f3039efe9b261746370305f894",
  "SHA-224|a113": "e623caedb98b77b63f4e2f5316ea3f48b9b864fc852e1e6eb97aa101",
  "SHA-224|digits": "05fc4e9633f87a778e95e72198cdb526885a53325b06e29eebfd51dc",
  // SHA-256
  "SHA-256|":
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "SHA-256|abc":
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "SHA-256|fox":
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  "SHA-256|你好":
    "670d9743542cae3ea7ebe36af56bd53648b0a1126162e78d81a32934a711302e",
  "SHA-256|a55":
    "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
  "SHA-256|a56":
    "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
  "SHA-256|a57":
    "f13b2d724659eb3bf47f2dd6af1accc87b81f09f59f2b75e5c0bed6589dfe8c6",
  "SHA-256|a63":
    "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34",
  "SHA-256|a64":
    "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
  "SHA-256|a65":
    "635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0",
  "SHA-256|a111":
    "6374f73208854473827f6f6a3f43b1f53eaa3b82c21c1a6d69a2110b2a79baad",
  "SHA-256|a112":
    "f54353008a2553262ecdc4a34749563ba0950e8b0fc8652780b0a614b99683c1",
  "SHA-256|a113":
    "ba02731ae695aae5cd49b49d84330b63995733eb22102aca755f0179b1e0e20f",
  "SHA-256|digits":
    "fb871ff8cce8fea83dfaeab41784305a1461e008dc02a371ed26d856c766c903",
  // SHA-384（W128 顺序）
  "SHA-384|":
    "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b",
  "SHA-384|abc":
    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
  "SHA-384|你好":
    "05f076c7d180e91d80a56d70b226fca01e2353554c315ac1e8caaaeca2ce0dc0d9d84e206a2bf1143a0ae1b9be9bcfa8",
  "SHA-384|a111":
    "3c37955051cb5c3026f94d551d5b5e2ac38d572ae4e07172085fed81f8466b8f90dc23a8ffcdea0b8d8e58e8fdacc80a",
  "SHA-384|a112":
    "187d4e07cb306103c69967bf544d0dfbe9042577599c73c330abc0cb64c61236d5ed565ee19119d8c31779a38f791fcd",
  "SHA-384|a113":
    "1d6bed01626682961b50da078a6b1da707c1da0c8a0a3226f159235bd45ed724a0622fa6f39fd70007a6c72a5cda43ae",
  "SHA-384|a127":
    "9bd06b1763c2cf7aef40e795dc65bc96d59c41b537f3ad72ebdefd485476b5717c1aeb37c327fe9c1831b12b9efd08ae",
  "SHA-384|a128":
    "edb12730a366098b3b2beac75a3bef1b0969b15c48e2163c23d96994f8d1bef760c7e27f3c464d3829f56c0d53808b0b",
  "SHA-384|a129":
    "39b6f5a7b0e781dbc419f72e49b30eaac10f2c98c4403bc610da31067fd1b48f324138c8615d2b496d08d73d5e865326",
  "SHA-384|a135":
    "f6e9d2cdb8974143b2afa1c7cf3c013d41a3c8ae1b9f7a80a4f2d3c59344eb6a3901bdd148b492d85d0a49d46d6fba1d",
  "SHA-384|a136":
    "726d033b474519d5ca49a351c40f6c0c4cf2848de3eb695f6fefc019206e215a839570d617236e3628d0242e8d250fab",
  "SHA-384|a137":
    "d6a5f27e8cd5e366057038c7b0a913fb6312ea1ce743a401d42adc0756b1b66222cc43e397d0fba36280c434b02ef790",
  // SHA-512
  "SHA-512|":
    "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
  "SHA-512|abc":
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  "SHA-512|你好":
    "5232181bc0d9888f5c9746e410b4740eb461706ba5dacfbc93587cecfc8d068bac7737e92870d6745b11a25e9cd78b55f4ffc706f73cfcae5345f1b53fb8f6b5",
  "SHA-512|a111":
    "fa9121c7b32b9e01733d034cfc78cbf67f926c7ed83e82200ef86818196921760b4beff48404df811b953828274461673c68d04e297b0eb7b2b4d60fc6b566a2",
  "SHA-512|a112":
    "c01d080efd492776a1c43bd23dd99d0a2e626d481e16782e75d54c2503b5dc32bd05f0f1ba33e568b88fd2d970929b719ecbb152f58f130a407c8830604b70ca",
  "SHA-512|a113":
    "55ddd8ac210a6e18ba1ee055af84c966e0dbff091c43580ae1be703bdb85da31acf6948cf5bd90c55a20e5450f22fb89bd8d0085e39f85a86cc46abbca75e24d",
  "SHA-512|a127":
    "828613968b501dc00a97e08c73b118aa8876c26b8aac93df128502ab360f91bab50a51e088769a5c1eff4782ace147dce3642554199876374291f5d921629502",
  "SHA-512|a128":
    "b73d1929aa615934e61a871596b3f3b33359f42b8175602e89f7e06e5f658a243667807ed300314b95cacdd579f3e33abdfbe351909519a846d465c59582f321",
  "SHA-512|a129":
    "4f681e0bd53cda4b5a2041cc8a06f2eabde44fb16c951fbd5b87702f07aeab611565b19c47fde30587177ebb852e3971bbd8d3fd30da18d71037dfbd98420429",
  "SHA-512|a135":
    "018305457c1804285649e77d1ada038a4db3b166a39dc93504584bbb9f95be2d5a2147798aa71d0f240f442d2daf4928695548cf828c7fe314149544b442fb7c",
  "SHA-512|a136":
    "389860167dc973108096b0c37276b4d62dd707c9826651318ad560af1daf234376f49e95419d310e9c5095d439f6d16e978e848d1951b1586dec6e0aaa84e61c",
  "SHA-512|a137":
    "1d91d9f1934334408937ab161416f6276975c50cc980c6fdd332496c5c0ec29f62baac0b2c0acbf8e57336acf93c1e3172eb6c627a02679b419a90acc7c8a65f",
  // SHA3-224（SHA3 顺序）
  "SHA3-224|": "6b4e03423667dbb73b6e15454f0eb1abd4597f9a1b078e3f5b5a6bc7",
  "SHA3-224|abc": "e642824c3f8cf24ad09234ee7d3c766fc9a3a5168d0c94ad73b46fdf",
  "SHA3-224|你好": "d6e2200b43a6997075692b6dde5ca9f91cae1d15f72546d3c9a9d8c4",
  "SHA3-224|b71": "214c1fe1745cae06f95ffa878e26235d6f9c8f7026958efdfce9195b",
  "SHA3-224|b72": "80913b0c380e5d013d9e5c12935cf078a6d2c17d563c380b4cd68a04",
  "SHA3-224|b73": "0440da57fe0712d3ef491622101d437b7873b52c8a893752727af726",
  "SHA3-224|b103": "90ee8d4f896ab7d4621180d254a6895d3fd941e6a195b33dcea9edf6",
  "SHA3-224|b104": "98231146f5b55d88dc92305b6785e25d43a96e697fb750d6b932a9f5",
  "SHA3-224|b105": "4308822897576ce3eb4e52b5d8338d4c7c1af887662180f247e70ada",
  "SHA3-224|a135": "f9f28c21a2b0884bbd3594cae82bf811c0c1ede427e083d5576e909d",
  "SHA3-224|a136": "96136a6a094433b4aa855f163829a2ce6bca7d56cfd2163b47f1f1c4",
  "SHA3-224|a137": "d0c9e8452b199b5149b9d06ec79e70ccd82ffa317bf61196f12b7207",
  "SHA3-224|a143": "73b1b22b54f515f626a6abdde6af25cd4801dc6e9dc7fa3f77e1c122",
  "SHA3-224|a144": "f9019111996dcf160e284e320fd6d8825cabcd41a5ffdc4c5e9d64b6",
  "SHA3-224|a145": "7f0521c84aeacc8a46aba17171acbdd22522509a71c663257fbdee0e",
  "SHA3-224|b215": "fe7e4a5cf1125658a5237f28e0012e0a8924d45e57e44372e39c2814",
  "SHA3-224|b216": "8664185df46503d85c4aaad2ac3046e56dd3e274e3ae3c0dd3656df1",
  "SHA3-224|b217": "fee2c96499701e5519c6a969f4e4e04ef05ec8a917f170c7dbba515e",
  // SHA3-256
  "SHA3-256|":
    "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
  "SHA3-256|abc":
    "3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532",
  "SHA3-256|你好":
    "0100e69a7157f3a814a3cf6895f4fccd6b610b9947224b2aaa7aa11dd0dca833",
  "SHA3-256|b71":
    "90b03e54a4465235632cb733030f4fa5e47bba51e989557b72db22f2842a7771",
  "SHA3-256|b72":
    "3346072b7718155724bd35f3d90591fbb60ee06415a49ebcffb1b73a2f1389b8",
  "SHA3-256|b73":
    "596c62fdae3002e823d20afd46d0c380d9e147afe8d69bdd6d344999589e68bf",
  "SHA3-256|b103":
    "6ac487867978b9d628d4fe1d1056f74a00b3e5a3234faf387853f5e8f5d5993e",
  "SHA3-256|b104":
    "25b3ce172ee99cb9e46d45f4d75ba6bcc6452c4bd6bcfd8fce52810d0d9f8079",
  "SHA3-256|b105":
    "3800762de0e91b4288808cba4fed4a6531639b48c8865a58c83227e44637edca",
  "SHA3-256|a135":
    "8094bb53c44cfb1e67b7c30447f9a1c33696d2463ecc1d9c92538913392843c9",
  "SHA3-256|a136":
    "3fc5559f14db8e453a0a3091edbd2bc25e11528d81c66fa570a4efdcc2695ee1",
  "SHA3-256|a137":
    "f8d6846cedd2ccfadf15c5879ef95af724d799eed7391fb1c91f95344e738614",
  "SHA3-256|a143":
    "2fca8e6f1fe530553ba362bcbdcb514588001280450c0d1a86bac02714dc9dcb",
  "SHA3-256|a144":
    "fe4206d88b37fb533f957c384ad50f2a7cb86a74eb53e4e591f1c07d5c719dcf",
  "SHA3-256|a145":
    "ae4947f8dda0814cd69b4cdc87e350ee097bd41c761c1a367c3e1ed96e88090f",
  "SHA3-256|b215":
    "e21ab1a4739db41ccac9e44e249d30084af8f4d39726aa43e7d16b13b0671e34",
  "SHA3-256|b216":
    "3b9b6f158b631fc99e3e7fae258a2faef4b6984eaa1cb423e042b29ffa82c17c",
  "SHA3-256|b217":
    "4dcd33c351de912c4a708d133fecf67f05ba3eba4caeb45b59860803209717d5",
  // SHA3-384
  "SHA3-384|":
    "0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2ac3713831264adb47fb6bd1e058d5f004",
  "SHA3-384|abc":
    "ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25",
  "SHA3-384|你好":
    "bdc0b2e622a1d79abae4cabbf86bd88192dead3b90c8332ac4bac08e9a2c06d5c685f46101ac0c14980849f39a7b0ebf",
  "SHA3-384|b71":
    "c217f531aa4ca8904d5144287b53351d3b7c2c8651a3091966266b7f62a9dc6d48c71b812dd32501932fc2dc4e828b91",
  "SHA3-384|b72":
    "df68717fd211cc23319c80593e2c75d46b4cbe69306ec4519b32c258627fcdc0b919ca60b24cddbb5dc0f606570f48b7",
  "SHA3-384|b73":
    "471f7cca16b3decfca8b40d57b22a44b8abb41c0cacb00f1ae2fb4a8a0bd42ce4687760aecb8df4f73913f3bbc5caa2f",
  "SHA3-384|b103":
    "ca5204d1999df0388223071dff17d3d555d20ebb917cf4c242cab75714e49aed01b0cf736fe46f7faa90706ef244e882",
  "SHA3-384|b104":
    "06c82c62ba1cbf29085f1c9a9ba1349c265098ff2dcf6f601effd373b5b7e7e01380c0361ee81da91f0691fb1ad41172",
  "SHA3-384|b105":
    "ef772bc6d22c86726760365a73ae30d4d04af94bf31897c8bbfa879eec035436b72a8ec31fd19d78490db3b165da5e18",
  "SHA3-384|a135":
    "a2d51907c0611e25c058f0675042e8f53cc473dc347c5ea8a813d886b3aa8f8dcab61a236237d94de404cd66606243f9",
  "SHA3-384|a136":
    "cbbcb466417a2f6d466479bb6dc659434d9589de3a53acc9b427580482e305948888c8fa6d069c5e6a899aa34a9af15a",
  "SHA3-384|a137":
    "8a9e401af96cfcdc6ee9e848a2ba4d94be808a753e7673df1252c9706fdef18943dbc7487cdecca0efcfef152891ab03",
  "SHA3-384|a143":
    "537595376aa73ceb86fcfda3228bdb49accb29fc0ae935bc2ed836a3c58c3d8679cb2d09c3120923741419b15416b624",
  "SHA3-384|a144":
    "a488d710c7e776359ce145d8383c304cae0e5dbb05ff64536f23caf3c27aa192e8342e271ea98fd30309e00c427cb61e",
  "SHA3-384|a145":
    "3b52dc8a4a3f5800f5de1f94479c0cff729d9779b17ee9ee1745d33a18843929ea3a7751696f4ecbb513e0e2220eee94",
  "SHA3-384|b215":
    "171cfed4ec078e2dfea518f2ab750a5f78f5a19f8eef709637e7e4a259d4b6753cc7238ebe123bf072c7bc880b5e027e",
  "SHA3-384|b216":
    "d1a25a988af405345b9ec093efb6b816838ad67d56e6fb983b50894a1d30de5bcfe6dcf9301ff465074ab561e5afb1ac",
  "SHA3-384|b217":
    "2faf1fee687cb738ea77cc6d77052bf5b41642e19975843a16ca769de5e4811aa558af23731b5988032f85ba9663d900",
  // SHA3-512
  "SHA3-512|":
    "a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26",
  "SHA3-512|abc":
    "b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0",
  "SHA3-512|你好":
    "d673e4b36755b938359fa394cf920b4430a34f447ea5cb10485d9d46a7d6682eef6d7459b4dac9019d908e08a1e7aaab3accde4f59e862dbb99f906d85e5c66d",
  "SHA3-512|b71":
    "53d7e6e226dc518cffd572277cee7ad64f63a2f79fa0c009b81cf95a9a20980d16cda96b415bc9902dd8fb10adb1c54e23adae87198a1a3c5dde01a717496f94",
  "SHA3-512|b72":
    "516af65b1657c658bf2071b27eaec64d6c1b9ca792a1973526e39ec4e6c4510b7bbe3d9f57600cb7995df1d0651405b27241eef8e0e2f69055d03105172e5cf0",
  "SHA3-512|b73":
    "dc263ce9d154cbef50204fcdff4a17e589b1a0e4134fe5c99e4ebbe157c7c765abefdfb7195501fb1fe9e15d452bd044493f8b472e0824e7c0668182c52e63de",
  "SHA3-512|b103":
    "81fe979bd30cc2892aee2c4af9806b6e7a74b7aeea7d941b4d30b8724a9edbe70f6e237f9a6881bbb6cd42eb61d23391d5aa460c092cd13328bfda9b3afcb462",
  "SHA3-512|b104":
    "33220e622dd3d43055e2bb9567aa17c82c57c63493682a07a66cef23d4247bdd125d68ab414e5e6fc0c644d3619f4196b99f6b03506c07074e57065c0991490b",
  "SHA3-512|b105":
    "c834301562054a20feb1196cb4eb77db8a4127668a0f3c7d123fe59c9e235a0b313cab4b94e34ce2674756c89248afb25c79f1367d9d4d6b2b41f50a4f1bc53f",
  "SHA3-512|a135":
    "4be1e70276f9122f470a54c27240c7d0709dab7469958b48a950d69da6dd07ca135826d9d23e975cb9283e7d236ef98a80451dca8e311f52096308b2c8d70cc7",
  "SHA3-512|a136":
    "e50392c91ed95768c8dcf52a12e5db1ecd0347fb995f7ff4ea06994649bbd1a0de7ae36a62aadc00a704d730b52bda191b72951e2afc9b6fb6824787b2086257",
  "SHA3-512|a137":
    "c1a51bff785ff8443c873d0f9b9534222f99b476b357091b00f52bcbf214be6c9febe2ab320f6f24c9d770d4ed2708611b4d6f3c03bcd7aec27a1d1d6b5f8768",
  "SHA3-512|a143":
    "1dfc536c0ef79e004ec6f18e3b24fd6c4c3076556424ef369e8734312d6594ff9b92a8f02d2980ab51c191a9cc3cf47d06265e81d306d4098cdf2b6bada1db27",
  "SHA3-512|a144":
    "446cd4d7ba19510dcc776b21045bc68d424b5b840e14685e149bb238b5f473c0356b69e04f0f5785eefce20ff09e678b080d8aac64568c5edf001cd32b2ed7a8",
  "SHA3-512|a145":
    "84a7b171615f4f0024b772defd5ea21a536bb1e52306fa7ad412c532ac919f6b645e412aa7f5d979808c8ae03ca7d159363dcdb179c9b03f908e3b3526cbf4de",
  "SHA3-512|b215":
    "b6839394963f25ebfd22e7a55ec3469aa6f251d46514235f3352d63aa47b2ffe16a16b5eef1d7071ad5de9bf49dea40eeafb6236107dbb9c95ba37904fefb94a",
  "SHA3-512|b216":
    "13918ad34b8a56b8938f92c984cfd9e6e523e44dde86c5a516939f6ad8ba37af308eb91ad26e2d7d45c5dd3b21b21c442c65220fa8994577a4d0f50e83746b5c",
  "SHA3-512|b217":
    "74806531b7bcbb990e3438f7a2c7aead4c656e01003c45b444407cdeeb9cac4788eb4f6db85fdca5979b42625c3ec0289f51cc09b7b84e40af51d327a3600c68",
  // SM3（W64 顺序）
  "SM3|": "1ab21d8355cfa17f8e61194831e81a8f22bec8c728fefb747ed035eb5082aa2b",
  "SM3|abc": "66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0",
  "SM3|fox": "5fdfe814b8573ca021983970fc79b2218c9570369b4859684e2e4c3fc76cb8ea",
  "SM3|你好":
    "78e5c78c5322ca174089e58dc7790acf8ce9d542bee6ae4a5a0797d5e356be61",
  "SM3|a55": "288337eef51eec62e7544d7270424c8dbe656254c99852870a73b2453a6a7fb1",
  "SM3|a56": "ba00ebedaab54065a5fd4f9f56326016203166bcee3eed44ea868d59d67aa3c8",
  "SM3|a57": "698e3fcc7a0b1515656a61db7e88805672285e83a4c24742dbade0c4010f32c0",
  "SM3|a63": "587308543551881ebd70d27ad358ff5dcdf24ac54822e2f7b7c3edce0985d21b",
  "SM3|a64": "616ec433c359e7c2b19f360e2b8f2a1b6e9ed76b8dc1a7d207b31a5341c611e9",
  "SM3|a65": "3d1d94afa238ec3e2bbc20ad504702b24c16f2889c94973f2f8da3526c44e4bc",
  "SM3|a111":
    "2eaae5f88efcf99fb1ffce683f60ce0cbf3d2124ddf3dccdaf5f7fe63e937fd0",
  "SM3|a112":
    "41df1dc71afa3f78082cbf47cf8a7f6835741323bc36e8f7b7ca395ffeb75332",
  "SM3|a113":
    "7b610c8afe8acea14fef40e3ec034daac92f888e78c4248e1a000b16209571d6",
  "SM3|digits":
    "e0c276361df7b53678e235a76968323abb896ec2198608a56d2d60b092903d99",
};

/** 向量输入 → 查找键 */
function keyOf(input: string): string {
  if (input === "") return "";
  if (input === "abc") return "abc";
  if (input === "The quick brown fox jumps over the lazy dog") return "fox";
  if (input === "你好") return "你好";
  if (input === "0123456789".repeat(5)) return "digits";
  // 同一字符重复 ≥2 次 → "字符+长度"（如 55 个 'a' → "a55"）
  if (/^(.)\1+$/.test(input)) return `${input[0]}${input.length}`;
  return input;
}

const SUITES: Array<{ algo: HashAlgorithm; vectors: Vector[] }> = [
  { algo: "MD5", vectors: W64 },
  { algo: "SHA-1", vectors: W64 },
  { algo: "SHA-224", vectors: W64 },
  { algo: "SHA-256", vectors: W64 },
  { algo: "SHA-384", vectors: W128 },
  { algo: "SHA-512", vectors: W128 },
  { algo: "SHA3-224", vectors: SHA3 },
  { algo: "SHA3-256", vectors: SHA3 },
  { algo: "SHA3-384", vectors: SHA3 },
  { algo: "SHA3-512", vectors: SHA3 },
  { algo: "SM3", vectors: W64 },
];

describe("哈希算法标准向量", () => {
  for (const { algo, vectors } of SUITES) {
    it(algo, () => {
      for (const [input] of vectors) {
        const expected = EXPECTED[`${algo}|${keyOf(input)}`];
        if (expected === undefined)
          throw new Error(`缺少向量期望值：${algo} ${keyOf(input)}`);
        expect(
          bytesToHex(createHasher(algo).update(utf8Bytes(input)).digest()),
        ).toBe(expected);
      }
    });
  }

  it("CRC-32 标准值", () => {
    expect(
      bytesToHex(createHasher("CRC-32").update(utf8Bytes("")).digest()),
    ).toBe("00000000");
    expect(
      bytesToHex(
        createHasher("CRC-32").update(utf8Bytes("123456789")).digest(),
      ),
    ).toBe("cbf43926");
    expect(
      bytesToHex(
        createHasher("CRC-32")
          .update(utf8Bytes("The quick brown fox jumps over the lazy dog"))
          .digest(),
      ),
    ).toBe("414fa339");
  });

  it("未知算法抛错", () => {
    expect(() => createHasher("MD6" as HashAlgorithm)).toThrow();
  });
});

describe("增量 update 一致性", () => {
  /** 确定性伪随机字节（LCG） */
  function pseudoRandom(n: number, seed = 0x2f6e2b1): Uint8Array {
    const out = new Uint8Array(n);
    let s = seed >>> 0;
    for (let i = 0; i < n; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      out[i] = s >>> 24;
    }
    return out;
  }

  const ALL = HASH_ALGORITHMS.map((m) => m.id);

  it("随机分块与一次喂入结果一致（100KB）", () => {
    const data = pseudoRandom(100_000);
    for (const algo of ALL) {
      const once = bytesToHex(createHasher(algo).update(data).digest());
      let seed = 12345;
      const rnd = () =>
        ((seed = (Math.imul(seed, 48271) + 11) >>> 0) % 251) + 1;
      const h = createHasher(algo);
      let off = 0;
      while (off < data.length) {
        const step = Math.min(rnd(), data.length - off);
        h.update(data.subarray(off, off + step));
        off += step;
      }
      expect(bytesToHex(h.digest()), algo).toBe(once);
    }
  });

  it("hashText 与单算法结果一致", () => {
    const text = "Hello 你好，世界！ line2\ttab";
    const all = hashText(ALL, text);
    for (const algo of ALL) {
      expect(all[algo], algo).toBe(
        bytesToHex(createHasher(algo).update(utf8Bytes(text)).digest()),
      );
    }
  });
});

describe("文件哈希（流式分块）", () => {
  it("多算法单遍计算与权威值一致，进度单调至 100%", async () => {
    const data = new Uint8Array(1_000_000 + 123);
    let s = 0x9e3779b9;
    for (let i = 0; i < data.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      data[i] = s >>> 24;
    }
    const file = new File([data], "random.bin");
    const percents: number[] = [];
    const result = await hashFile(
      ["MD5", "SHA-256", "SHA-512", "SHA3-256", "SM3", "CRC-32"],
      file,
      {
        chunkBytes: 300_007,
        onProgress: (p) => percents.push(p),
      },
    );
    expect(result.name).toBe("random.bin");
    expect(result.size).toBe(data.length);
    expect(percents[percents.length - 1]).toBe(100);
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1]);
    }
    for (const algo of [
      "MD5",
      "SHA-256",
      "SHA-512",
      "SHA3-256",
      "SM3",
      "CRC-32",
    ] as const) {
      expect(result.hashes[algo], algo).toBe(
        bytesToHex(createHasher(algo).update(data).digest()),
      );
    }
  });

  it("空文件", async () => {
    const file = new File([new Uint8Array(0)], "empty.bin");
    const result = await hashFile(["MD5", "SHA-256"], file);
    expect(result.hashes["MD5"]).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(result.hashes["SHA-256"]).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("取消：分块间隙抛出 HashCancelledError", async () => {
    const file = new File([new Uint8Array(1024)], "cancel.bin");
    await expect(
      hashFile(["MD5"], file, { chunkBytes: 256, shouldCancel: () => true }),
    ).rejects.toBeInstanceOf(HashCancelledError);
  });
});

describe("展示辅助", () => {
  it("formatDigest 三种格式", () => {
    const hex = "0a0b0c";
    expect(formatDigest(hex, "lower")).toBe("0a0b0c");
    expect(formatDigest(hex, "upper")).toBe("0A0B0C");
    expect(formatDigest(hex, "base64")).toBe(btoa("\x0a\x0b\x0c"));
  });

  it("matchesExpected 支持 hex 大小写与 Base64", () => {
    const hex = "deadbeef";
    expect(matchesExpected(hex, "deadbeef")).toBe(true);
    expect(matchesExpected(hex, "  DEAD BEEF ")).toBe(true);
    expect(matchesExpected(hex, hex.toUpperCase())).toBe(true);
    expect(matchesExpected(hex, btoa("\xde\xad\xbe\xef"))).toBe(true);
    expect(matchesExpected(hex, "deadbeee")).toBe(false);
    expect(matchesExpected(hex, "")).toBe(false);
  });
});
